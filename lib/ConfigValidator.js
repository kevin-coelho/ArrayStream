const joi = require('joi');

const bufferedArrayConfigSchema = joi
  .object({
    file: joi
      .object()
      .keys({
        folder: joi
          .string()
          .lowercase()
          .regex(/[a-zA-Z_-]+/)
          .required(),
        keyPattern: joi
          .string()
          .lowercase()
          .regex(/[a-zA-Z_-]+\$\$/)
          .required(),
        fileType: joi
          .string()
          .lowercase()
          .allow(...['json'])
          .required(),
        numDigits: joi.number().integer().min(1).default(4),
      })
      .required(),
    mkdirRecursive: joi.boolean().optional().default(false),
    maxItems: joi.number().integer().min(1).required(),
    itemValidationSchema: joi.object().optional(),
    overwrite: joi.boolean().optional().default(false), // overwrite file if exists
    lazy: joi.boolean().optional().default(true), // don't open an outstream until we have to write
    append: joi.boolean().optional().default(false), // append to existing file, otherwise increment file name
    verbose: joi.boolean().optional().default(false), // print messages
    debug: joi.boolean().optional().default(false), // print debug messages
  })
  .unknown()
  .required();

module.exports = bufferedArrayConfigSchema;
