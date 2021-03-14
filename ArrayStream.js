// DEPENDENCIES
const { Writable } = require('stream');
const path = require('path');
const fs = require('fs');
const Promise = require('bluebird');

// LOCAL DEPS
const CONSTANTS = require('./lib/constants');
const configValidator = require('./lib/ConfigValidator');

class ArrayStream extends Writable {
  /**
   * @param {ArrayStreamConfig} args
   * @param {LoggerSchema} logger
   * @throws {Error}
   */
  constructor(args, logger = console) {
    super(Object.assign(args, { objectMode: true }));

    // validate config
    const { error, value } = configValidator.validate(args);
    if (error) throw error;
    this.config = value;
    if (this.config.append && this.config.overwrite)
      throw new Error(
        'ArrayStream: config.append and config.overwrite cannot both be true',
      );

    // trim excessive file types at the end of keyPattern
    if (this.config.file.keyPattern.endsWith('.' + this.config.file.fileType)) {
      this.config.file.keyPattern = this.config.file.keyPattern.replace(
        new RegExp(`.${this.config.file.fileType}$`),
        '',
      );
    }

    // try to create validation object from validation schema
    if (this.config.itemValidationSchema) {
      if (!this.config.itemValidationSchema.validate) {
        throw new Error(
          'config.itemValidationSchema must be a valid joi schema with a .validate method',
        );
      }
      this.itemValidationSchema = this.config.itemValidationSchema;
    } else {
      this.itemValidationSchema = null;
    }

    this.logger = logger;
    this.sep = '';
    this.count = 0;
    this.fileCount = 0;
    this.files = [];
    this.incrementKey();
    this.destroyed = false;
    this.outstream = null;
    if (!this.config.lazy) this.openOutstream();
  }

  /**
   * Close this ArrayStream and return a promise when
   * it has finished (see node stream 'finish' event).
   *
   * Call this to manually end this array stream and listen
   * for the finishing event.
   *
   * @return {(Promise|Promise)|Promise<void>}
   */
  closeArrayStream() {
    if (this.destroyed) return Promise.resolve();
    this.end();
    return new Promise((resolve) => {
      this.on('finish', resolve);
    });
  }

  /**
   * Implement the writable _write method. Convert non-Buffer / non-string
   * chunk objects to JSON.stringified strings, and write them to the internal
   * outstream. If needed, reset the outstream and start writing to a new
   * file handle (if config maxItems has been exceeded).
   *
   * @param chunk
   * @param encoding
   * @param cb
   * @private
   */
  _write(chunk, encoding, cb) {
    if (this.destroyed) cb();
    if (this.config.lazy) {
      if (!this.outstream) this.openOutstream();
    }
    // validate chunk
    if (this.itemValidationSchema) {
      const { err } = this.validateChunk(chunk);
      if (err) return cb(err);
    }

    // convert chunk if needed
    if (
      !Buffer.isBuffer(chunk) &&
      !(typeof chunk == 'string' || chunk instanceof String)
    ) {
      try {
        chunk = JSON.stringify(chunk);
      } catch (err) {
        cb(new Error(err));
      }
    }

    try {
      if (this.count >= this.config.maxItems) {
        this.resetOutstream().then(() =>
          this.outstream.write(this.sep + chunk, () => {
            if (!this.sep) this.sep = CONSTANTS.SEPARATOR;
            this.incrementCount();
            cb();
          }),
        );
      } else {
        this.outstream.write(this.sep + chunk, () => {
          if (!this.sep) this.sep = CONSTANTS.SEPARATOR;
          this.incrementCount();
          cb();
        });
      }
    } catch (err) {
      cb(new Error(err));
    }
  }

  /**
   * Implement the Writable _final method. Callback when internal outstream
   * buffer has been flushed
   *
   * @param cb
   * @private
   */
  _final(cb) {
    // flush outstream
    this.flushOutstream(true)
      .then(() => {
        cb();
      })
      .catch((err) => cb(err)); // cb and return
  }

  /**
   * If a validator is provided to this ArrayStream, validate it
   * before writing to the outstream
   *
   * @param chunk
   * @return {{err: *}|{err: null}}
   */
  validateChunk(chunk) {
    if (Buffer.isBuffer(chunk)) {
      chunk = chunk.toString();
    }
    try {
      const { error } = this.itemValidationSchema.validate(chunk);
      if (error) return { err: error };
      else return { err: null };
    } catch (err) {
      return { err };
    }
  }

  /**
   * Reset this ArrayStream's file handle / outstream. If final is true,
   * don't open a new outstream. Otherwise, increment this ArrayStream's
   * key, reset count, and open a new outstream to the new key. Returns
   * a Promise that resolves with the new outstream has been opened, or
   * when the old outstream has been cleaned up (when final is true).
   *
   * file_0000.json --> file_0001.json
   *
   * @param final
   * @return {Promise|Promise}
   */
  resetOutstream(final = false) {
    // IMPORTANT: make sure to call this below
    const cb = (resolve) => {
      if (this.outstream) {
        this.outstream.destroy();
      }
      // create new outstream and pipe to it
      if (!final) {
        // reset counter
        this.resetCount();
        this.incrementKey();
        this.openOutstream();
      } else {
        this.outstream = null;
      }
      resolve();
    };

    return new Promise((resolve, reject) => {
      if (this.config.verbose) {
        this.logger.debug(
          'ArrayStream: closing local fs stream',
          this.getConfig().filePath,
        );
      }
      if (this.outstream) {
        this.outstream.end(']\n', () => cb(resolve));
      } else {
        cb(resolve);
      }
    });
  }

  /**
   * Increment this ArrayStream's "key" / current file handle.
   *
   * file_0000.json --> file_0001.json
   */
  incrementKey() {
    this.key =
      this.config.file.keyPattern.replace(
        /\$\$/,
        this.fileCount.toString().padStart(this.config.file.numDigits, '0'),
      ) +
      '.' +
      this.config.file.fileType;
    this.fileCount += 1;
  }

  /**
   * Increment the count for items written to the current file handle
   * @param count
   */
  incrementCount(count = 1) {
    this.count += count;
  }

  /**
   * Reset the count for items written to the current file handle
   */
  resetCount() {
    this.count = 0;
  }

  /**
   * Get the count of items written to this ArrayStream's current file handle
   *
   * @return {number}
   */
  getCount() {
    return this.count;
  }

  /**
   * Get the total count of items written of all of this ArrayStream's file
   * handles (past and current)
   *
   * @return {number}
   */
  getTotalCount() {
    if (this.files.length > 1)
      return (this.files.length - 1) * this.config.maxItems + this.count;
    return this.count;
  }

  /**
   * Get this ArrayStream's current filePath (local mode)
   *
   * @return {{Bucket: *, Key: string}|{filePath: string}}
   */
  getConfig() {
    return {
      filePath: path.join(this.config.file.folder, this.key),
    };
  }

  /**
   * Ensure that this ArrayStream's directory exists, otherwise create it
   */
  ensureFolder() {
    const folderPath = this.config.file.folder;
    try {
      fs.statSync(folderPath);
    } catch (err) {
      fs.mkdirSync(folderPath, { recursive: this.config.mkdirRecursive });
    }
  }

  /**
   * Get list of files this ArrayStream has written to
   * @return {Array}
   */
  getFilePaths() {
    return this.files;
  }

  /**
   * Open an outstream to this ArrayStream's current file handle. Depending
   * on the settings specified in the constructor, this will either open an
   * append outstream to an existing file, overwrite an existing file, or
   * avoid existing files by incrementing the counter until a free "key"
   * is reached (i.e. if file_0000, file_0001, file_0002 all exist, the
   * ArrayStream will open file_0003). See the constructor for more details
   * on how to configure this.
   */
  openOutstream() {
    let params = this.getConfig();

    // check file exists && if append mode
    if (!this.config.append && !this.config.overwrite) {
      let newFile = true;
      while (newFile) {
        try {
          fs.statSync(params.filePath);
          this.incrementKey();
          params = this.getConfig();
        } catch (err) {
          newFile = false;
        }
      }
    }

    // logging
    if (this.config.verbose) {
      this.logger.debug(
        'ArrayStream: opening local fs stream',
        params.filePath,
      );
    }

    // create overwrite or append writestream if in local mode
    this.ensureFolder();
    // add file to files list
    this.files.push(params.filePath);
    try {
      if (this.config.overwrite) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error('Go to next catch statement');
      }
      const { size } = fs.statSync(params.filePath);
      if (this.config.debug)
        this.logger.debug('ArrayStream: Opening append outstream. Size:', size);
      let useSep = false;
      if (size >= 3) {
        if (this.config.debug) this.logger.debug('file size >=3 ');
        const buf = new Buffer.alloc(1);
        const fd = fs.openSync(params.filePath, 'r');
        const bytesRead = fs.readSync(fd, buf, 0, 1, size - 3);
        if (bytesRead === 1) {
          if (this.config.debug) this.logger.debug('read 1 byte');
          const str = buf.toString();
          useSep = !(str === '[' || str === ',');
          if (this.config.debug)
            this.logger.debug('got str', str, 'usesep', useSep);
        }
        fs.closeSync(fd);
      }
      this.outstream = fs.createWriteStream(params.filePath, {
        flags: 'a+',
        start: size - 2,
      });
      if (this.config.verbose)
        this.logger.debug(
          'ArrayStream: opening local fs stream in a+ mode',
          params.filePath,
        );
      this.sep = useSep ? CONSTANTS.SEPARATOR : '';
    } catch (err) {
      if (this.config.debug) this.logger.error(err);
      if (this.config.debug)
        this.logger.debug('ArrayStream: Opening overwrite outstream');
      this.outstream = fs.createWriteStream(params.filePath);
      if (this.config.verbose)
        this.logger.debug(
          'ArrayStream: opening local fs stream in w mode',
          params.filePath,
        );
      this.outstream.write('[');
      this.sep = '';
    }
  }

  /**
   * Flush this ArrayStream's buffer to file.
   * Returns a promise that resolves when this ArrayStream has flushed its content
   *
   * @param final
   * @return {Promise<void>}
   */
  flushOutstream(final = false) {
    if (this.destroyed) return Promise.resolve();
    if (final) this.destroyed = true;
    // flush items to file here
    if (this.config.verbose) {
      this.logger.debug(
        'ArrayStream flushBuffer: Flushing to local filesystem',
      );
    }
    return this.resetOutstream(final);
  }
}

module.exports = ArrayStream;
