const cmd = require('node-cmd');
const fs = require('fs');
const prompt = require('prompt');
const config = fs.existsSync('./config.js') ? require('./config.js') : '';

let bastion = config && config.bastion;
let mongodb = config && config.mongodb;
const wstream = fs.createWriteStream('./Results/quotes.txt');


let numQuotes;
let totComplete = 1;

wstream.on('finish', () => {
  console.log('SUCCESS! --> open quotes.txt in the Results directory of this project');
});

startProgram();
function startProgram() {
    prompt.start();
    if (!bastion || !mongodb) {
        console.log('Please supply your logins');
        prompt.get(['bastion', 'mongodb'], (err, inputs) => {
            fs.writeFile('config.js', `module.exports = {bastion: \'${inputs.bastion}\', mongodb: \'${inputs.mongodb}\'};`, (err, file) => {
                if (err) console.log('logins not saved! -->', err);
                bastion = inputs.bastion;
                mongodb = inputs.mongodb;
                setTimeout(() => startProgram(), 500);
            });
        });
    } else {
        console.log('**--- Drag and drop your .txt file below and press Enter ---**')
        prompt.get(['filePath'], (err, result) => {
            const fullPath = result.filePath;
            const commandsToGetFile = `less -FX ~ ${fullPath}`;
            cmd.get(
                commandsToGetFile,
                (err, data, stderr) => {
                    const quoteIds = data.split('\r').join('').split('\n');
                    numQuotes = quoteIds.length;
                    const numBatches = Math.ceil(quoteIds.length / 15);
                    let batches = [...Array(numBatches)].map((_, i) => {
                        const sliceIdx = i * 15;
                        return batchUpQueries(quoteIds.slice(sliceIdx, sliceIdx + 15))
                    });

                    executePromisesInOrder(0, batches)
                });
        });

        const batchUpQueries = (quoteIds) => {
            let batch = `${mongodb} << HERE\nrs.slaveOk()\n`;
            quoteIds.forEach(ID => {
                batch += `db.quotes.find({"policy.quoteId": "${ID}"})\n`
            });
            batch += 'HERE';
            return batch;
        };

        const executePromisesInOrder = (idx, batches) => {
            if (idx > batches.length - 1) {
                wstream.end();
                return;
            }

            getQuotesByBatch(batches[idx])
                .then(results => {
                    const formattedResults = removeObjectIdAndIsoDates(results).split("\n");
                    formattedResults.forEach((quotePayload, i) => {
                        try {
                            const jsonified = JSON.stringify(JSON.parse(quotePayload), null, 4);
                            wstream.write(`${jsonified} \n\n *** ============================================= *** \n\n`);
                            ++totComplete;
                        } catch (e) {
                            console.log(e);
                            console.log('\n\nPARSING FAILED for batch -->', batches[idx][i], '\n\n');
                        }
                    });
                    console.log(`${totComplete} of ${numQuotes} queries complete`);
                    executePromisesInOrder(idx += 1, batches);
                })
                .catch(error => {
                    console.log("ERROR GETTING QUOTES! --> index", batches[idx], error);
                    executePromisesInOrder(idx += 1, batches);
                })
        };

        const removeObjectIdAndIsoDates = (str) => {
            const objIdIdx = str.indexOf("ObjectId");
            const isoIdx = str.indexOf("ISODate");
            const isObjId = objIdIdx > -1;
            const sliceIdx = isObjId ? objIdIdx : isoIdx;

            if (objIdIdx === -1 && isoIdx === -1) {
                return str;
            }

            const objectIdOrIsoDateMethod = str.slice(sliceIdx, sliceIdx + (isObjId ? 36 : 35));
            const idOrDateString = objectIdOrIsoDateMethod.slice(objectIdOrIsoDateMethod.indexOf('\"') + 1, objectIdOrIsoDateMethod.indexOf('\"') + 25);
            const newStr = str.replace(objectIdOrIsoDateMethod, `\"${idOrDateString}\"`);
            return removeObjectIdAndIsoDates(newStr);
        };

        const getQuotesByBatch = (queryString) => {
            return new Promise((resolve, reject) => {
                cmd.get(`${bastion} ${queryString}`, (err, data, stderr) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1));
                });
            });

        };
    };
}
