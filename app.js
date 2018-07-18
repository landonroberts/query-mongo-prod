const cmd = require('node-cmd');
const fs = require('fs');

const bastion = 'ssh landonr@52.55.49.180';
const mongodb = 'mongo --host mongodb://raterProject:\"theRaterProjectIs4wesome!\"@10.100.16.76:27017/rater-prod';
const quoteIds = ["364817b147434db2cb89ff55686369e1cdde2ef9b5a1d6da3239444189677fab","ebd5ff13efa543f96421fa0ad30ccbab48ba17199f97accb632076dc0f0300f2","7684cfee4a8376bc8f9a18daa350fe4d1e6d9df42cde97848a9bda7782b75abe"];

const searchString = quoteIds.map(ID => `db.quotes.find({"policy.quoteId": "${ID}"}).pretty() `).join('\n');

const HERECommand = `${mongodb} << HERE\nrs.slaveOk()\n${searchString}\nHERE`;

cmd.get(`${bastion} ${HERECommand}`, (err, data, stderr) => {
  cmd.run("mkdir -p Results");
  fs.writeFile('./Results/quotes.txt', data, (err) => {
    if (err){
      console.log('ERROR', err)
        return
    }
    cmd.run("open ./Results/quotes.txt");
  });
});




