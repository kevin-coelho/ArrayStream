/**
 * @typedef {Object} WriteStreamConfig
 * @property {boolean} [objectMode] default=true this stream will break if this is set to false
 * @property {number} [highWaterMark] default=16 default 16 for object mode
 * @property {boolean} [decodeStrings] default=true
 * @property {string} [defaultEncoding] default='utf8'
 * @property {boolean} [emitClose] default=true
 * @property {boolean} [autoDestroy] default=false
 * @description See https://nodejs.org/api/stream.html#stream_constructor_new_stream_writable_options for more information
 */

/**
 * @typedef {Object} ArrayStreamFileConfig
 * @property {string} folder directory to write into
 * @property {string} keyPattern some_file_$$
 * @property {string} fileType file extension. currently allows "json" only
 * @property {string} [bucket] s3 bucket name, currently defaults to null
 */

/**
 *
 * @typedef {Object|WriteStreamConfig} ArrayStreamConfig
 * @property {ArrayStreamFileConfig} [file]
 * @property {boolean} [mkdirRecursive] create output directory for the arraystream recursively
 * @property {number} [maxItems] max # of items to write before opening next file
 * @property {joi.object} [itemValidationSchema] default=undefined validate each item before writing
 * @property {boolean} [local] write to file instead of opening stream to s3
 * @property {boolean} [overwrite] default=false overwrite existing file
 * @property {boolean} [lazy] default=true don't open outstream until anything has been written
 * @property {boolean} [append] default=false append to existing file, or increment file name
 * @property {boolean} [verbose] default=false print messages to console
 * @property {boolean} [debug] default=false print debug messages
 *
 */

/**
 * @typedef {Object|*} LoggerSchema
 * @property {function(...*)} trace
 * @property {function(...*)} debug
 * @property {function(...*)} info
 * @property {function(...*)} warn
 * @property {function(...*)} error
 * @property {function(...*)} fatal
 */
