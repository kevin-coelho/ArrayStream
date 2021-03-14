# ArrayStream
ArrayStream is a node.js utility to stream large quantities of json data to file, formatted as a large JSON array.
These can later be read using utilities like https://www.npmjs.com/package/stream-json.

## Features
- Extends node Writeable
- Will automatically convert JS objects into valid JSON
- Validation on each JSON chunk
- Automatically creates output folder and uses a basic increment file naming strategy
- Wait for stream end using bluebird Promise
- High level metadata / statistic such as: total count of items written, list of filenames written to
- Option to append to or overwrite existing files.
- Option to avoid existing files and start from nearest filename increment (if file_0001.json and file_0002.json exist, 
	write to file_0003.json)
- Set maximum number of objects to be written for each file and ArrayStream will auto-increment filename
- Option to set stream to "lazy" mode and not open any file handles until needed

## Usage
```
const ArrayStream = require('@kevin-coelho/json-arraystream');

const config = {
	file: {
		folder: './output',
		keyPattern: 'testFile_$$',
		fileType: 'json',
	},
	maxItems: 10,
	itemValidationSchema: joi
		.object()
		.keys({
			someNumber: joi.number().required(),
		})
		.required(),
	lazy: true,
};
const out = new ArrayStream(config);
out.on('error', () => an error occurred);
out.write({
	someNumber: 5
});
out.write({
	foo: 'bar',
}); // stream produces joi validation error

const hugeArray = [....];
hugeArray.forEach(chunk => out.write(chunk)); // out will create a new file for every 10 chunks written
await out.closeArrayStream(); // wait for stream to finish writing and close pipe / file handle
```

## Installation & Test
- `npm install json-arraystream`
- `npm run test`

## Roadmap
- Support limiting files by size rather than item limit
- Support streaming output to AWS S3 instead of local file
