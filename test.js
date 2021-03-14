const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const chalk = require('chalk');
const joi = require('joi');
const expect = require('chai').expect;
const rimraf = require('rimraf');
const path = require('path');

const ArrayStream = require('./ArrayStream');

async function cleanup() {
  return new Promise((resolve, reject) => {
    rimraf(path.resolve(path.join(__dirname, 'output')), (err) => {
      if (err) reject(err);
      console.info('Cleanup done!');
      resolve();
    });
  });
}

async function main() {
  let errFlag = false;
  const folder = path.resolve(path.join(__dirname, 'output'));
  try {
    const config = {
      file: {
        folder,
        keyPattern: 'testFile_$$',
        fileType: 'json',
      },
      maxItems: 10,
      itemValidationSchema: joi
        .object()
        .keys({
          index: joi.number().required(),
        })
        .required(),
      lazy: true,
    };
    // create arraystream
    const out = new ArrayStream(config);

    // catch errors
    out.on('error', (err) => {
      if (err instanceof joi.ValidationError) {
        console.error(chalk.red('Stream chunk failed validation'));
        console.error(err);
      } else {
        errFlag = true;
        console.error(chalk.red('Stream error occurred'));
        console.error(err);
      }
    });

    // create some milestones
    const firstHalf = 25;
    const secondHalf = 50;

    // write objects to the stream according to the itemValidationSchema
    for (let index = 0; index < firstHalf; index++) {
      out.write({
        index,
      });
    }

    // write a bad chunk
    out.write('I will not pass validation!');

    // write more objects
    for (let index = 25; index < secondHalf; index++) {
      out.write({
        index,
      });
    }

    // wait for writing to finish, then close
    await out.closeArrayStream();

    // look for expected files
    const expectedFiles = new Array(5).map((_, idx) => `testFile_${idx}.json`);

    // assert length of created files and expected file names
    const files = await fs.readdirAsync(folder);
    expect(files)
      .to.be.an('array')
      .with.length(expectedFiles.length)
      .and.to.have.deep.members(
      expectedFiles,
      'Created file names do not match expected file names',
    );

    const getExpectedData = (i) => {
      const a = new Array(10);
      for (let idx = 0; idx < a.length; idx++) {
        a[idx] = {
          index: (10 * i) + idx,
        }
      }
      return a;
    }

    // validate content
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const _data = await fs.readFileAsync(`${folder}/${f}`);
      const data = JSON.parse(_data);
      try {
        const expectedData = getExpectedData(i);
        expect(data)
          .to.be.an('array')
          .with.length(10)
          .and.to.have.deep.members(
          expectedData,
          `File ${f} does not match expected data`,
        );
      } catch (err) {
        console.error(err);
        errFlag = true;
      }
    }
  } catch (err) {
    errFlag = true;
    console.error(err);
  }

  if (errFlag) {
    console.warn(chalk.yellow('One or more tests failed or an error occurred!'));
  } else {
    console.info(chalk.green('All tests passed!'));
  }

  try {
    await cleanup();
  } catch (err) {
    console.error(err);
  }
}

return main();
