const dotenv = require('dotenv');
const networks = require('./networks.js');

dotenv.config();

module.exports = {
  networks,  // Use imported networks configuration
  mocha: {
    // timeout: 100000
  },
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  db: {
    enabled: false,
  }
};
