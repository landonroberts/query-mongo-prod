const cmd = require('node-cmd');
const fs = require('fs');
const prompt = require('prompt');
const config = fs.existsSync('./config.js') ? require('./config.js') : '';

let bastionLogin = config && config.bastionLogin;
let mongodbHost = config && config.mongodbHost;
const wstream = fs.createWriteStream('./Results/quotes.txt');


let numQuotes;
let totComplete = 0;

wstream.on('finish', () => {
  console.log('SUCCESS! --> open quotes.txt in the Results directory of this project');
});

runProgram();
function runProgram() {
    prompt.start();
    if (!bastionLogin || !mongodbHost) {
        console.log('Please supply your logins');
        prompt.get(['bastion_login', 'mongodb_password'], (err, inputs) => {
            bastionLogin = inputs.bastion_login;
            mongodbHost = `mongo --host mongodb://raterProject:\"${inputs.mongodb_password}\"@10.100.16.76:27017/rater-prod`;
            fs.writeFile('config.js', `module.exports = {bastionLogin: \'${bastionLogin}\', mongodbHost: \'${mongodbHost}\'};`, (err, file) => {
                if (err) console.log('logins not saved! -->', err);
                setTimeout(() => runProgram(), 500);
            });
        });
    } else {
        checkCredentials(bastionLogin, mongodbHost)
            .then(() => {
                console.log('\n**--- Drag and drop your .txt file into this terminal and press Enter ---**\n');
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

                            executeBatchedQueriesInOrder(batches)
                        });
                });
            })
            .catch(e => {
                const creds = e.cmd;
                const bast = creds.slice(creds.indexOf('h') + 2, creds.indexOf('mongo') - 1);
                const mongodb = creds.slice(creds.indexOf('raterProject:') + 14, creds.indexOf('@10') - 1);
                cmd.run('rm config.js');
                console.log('\nFAILED: check that your credentials below are correct - run npm start to try again', `\n\nBastion Login: ${bast}\nMongodb Password: ${mongodb}\n\n`)
            });
    }
}

function removeObjectIdAndIsoDates(str) {
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
}

function checkCredentials(bastionLogin, mongodbHost) {
    console.log('\nVALIDATING CREDENTIALS...');
    return new Promise((resolve, reject) => {
      cmd.get(`ssh ${bastionLogin} ${mongodbHost} << HERE\nrs.slaveOk()\ndb.quotes.find({\"policy.quoteId\": \"d0a1f3fb7d21a0d391755f8f8651f111ae97e7b5e64542e4b0db682c8d1a05d2\"})\nHERE`, (err, result) => {
         if (err) {
            reject(err);
            return;
         }
         console.log('SUCCESS!');
         resolve();
      });
    });
}

function batchUpQueries(quoteIds) {
    let batch = `${mongodbHost} << HERE\nrs.slaveOk()\n`;
    quoteIds.forEach(ID => {
        batch += `db.quotes.find({"policy.quoteId": "${ID}"})\n`
    });
    batch += 'HERE';
    return batch;
}

function executeBatchedQueriesInOrder(batches, idx = 0) {
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
                    console.log('\n\nPARSING FAILED for -->', batches[idx][i], '\n\n');
                }
            });
            console.log(`${totComplete + 1} of ${numQuotes} queries complete`);
            executeBatchedQueriesInOrder(batches, ++idx);
        })
        .catch(error => {
            console.log("ERROR GETTING QUOTES! --> ", batches[idx], error);
            executeBatchedQueriesInOrder(batches, ++idx);
        })
}

function getQuotesByBatch(queryString) {
    return new Promise((resolve, reject) => {
        cmd.get(`ssh ${bastionLogin} ${queryString}`, (err, data, stderr) => {
            if (err) {
                reject(err);
            }
            resolve(data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1));
        });
    });
}
