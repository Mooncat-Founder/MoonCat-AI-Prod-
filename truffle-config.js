const dotenv = require('dotenv');
const { networks } = require('./networks');

dotenv.config();

module.exports = {
  networks,  // Use imported networks configuration
  mocha: {
    // timeout: 100000
  },
  compilers: {
    solc: {
      version: "0.8.24",
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
