// utils/timelock-operations-storage.js
const fs = require('fs');
const path = require('path');

// Path to the operations storage file with better path resolution
const OPERATIONS_FILE = path.resolve(process.cwd(), 'config', 'timelock-operations.json');

const ensureDirectoryExists = (filePath) => {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
};


/**
 * Saves a timelock operation to storage
 * @param {Object} operation - The operation details
 * @param {string} operation.id - Operation ID 
 * @param {string} operation.target - Target contract address
 * @param {string} operation.value - ETH value
 * @param {string} operation.data - Function call data
 * @param {string} operation.predecessor - Predecessor operation ID
 * @param {string} operation.salt - Salt value
 * @param {string} operation.description - Human-readable description
 * @param {string} operation.network - Network where operation is scheduled
 * @param {number} operation.timestamp - Scheduled execution timestamp
 */
function saveOperation(operation) {
  let operations = [];
  
  console.log(`Attempting to save operation to: ${OPERATIONS_FILE}`);
  
  // Load existing operations if available
  if (fs.existsSync(OPERATIONS_FILE)) {
    try {
      const fileContent = fs.readFileSync(OPERATIONS_FILE, 'utf8');
      operations = JSON.parse(fileContent);
      console.log(`Successfully loaded existing operations file with ${operations.length} operations`);
    } catch (error) {
      console.warn(`Error reading operations file: ${error.message}`);
      // Continue with empty operations array
    }
  } else {
    console.log(`Operations file does not exist yet. Creating a new one.`);
  }
  
  // Check if operation already exists
  const index = operations.findIndex(op => op.id === operation.id);
  
  if (index >= 0) {
    // Update existing operation
    console.log(`Updating existing operation with ID: ${operation.id}`);
    operations[index] = { ...operations[index], ...operation };
  } else {
    // Add new operation
    console.log(`Adding new operation with ID: ${operation.id}`);
    operations.push({
      ...operation,
      createdAt: new Date().toISOString(),
    });
  }
  
  ensureDirectoryExists(OPERATIONS_FILE);

  // Write operations back to file
  try {
    fs.writeFileSync(OPERATIONS_FILE, JSON.stringify(operations, null, 2), 'utf8');
    console.log(`Successfully saved operation to ${OPERATIONS_FILE}`);
  } catch (error) {
    console.error(`Failed to write operations file: ${error.message}`);
    if (error.code === 'ENOENT') {
      // Try to create the directory structure if it doesn't exist
      try {
        const dir = path.dirname(OPERATIONS_FILE);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(OPERATIONS_FILE, JSON.stringify(operations, null, 2), 'utf8');
        console.log(`Created directory and saved operation to ${OPERATIONS_FILE}`);
      } catch (mkdirError) {
        console.error(`Failed to create directory structure: ${mkdirError.message}`);
      }
    }
  }
  
  return true;
}

/**
 * Gets a timelock operation by ID
 * @param {string} id - Operation ID
 * @returns {Object|null} - The operation or null if not found
 */
function getOperationById(id) {
  if (!fs.existsSync(OPERATIONS_FILE)) {
    console.log(`Operations file does not exist at: ${OPERATIONS_FILE}`);
    return null;
  }
  
  try {
    const fileContent = fs.readFileSync(OPERATIONS_FILE, 'utf8');
    const operations = JSON.parse(fileContent);
    
    return operations.find(op => op.id === id) || null;
  } catch (error) {
    console.warn(`Error reading operations file: ${error.message}`);
    return null;
  }
}

/**
 * Gets all timelock operations
 * @param {Object} filters - Optional filters
 * @param {string} filters.network - Filter by network
 * @returns {Array} - List of operations
 */
function getAllOperations(filters = {}) {
  if (!fs.existsSync(OPERATIONS_FILE)) {
    console.log(`Operations file does not exist at: ${OPERATIONS_FILE}`);
    return [];
  }
  
  try {
    const fileContent = fs.readFileSync(OPERATIONS_FILE, 'utf8');
    let operations = JSON.parse(fileContent);
    
    // Apply filters
    if (filters.network) {
      operations = operations.filter(op => op.network === filters.network);
    }
    
    return operations;
  } catch (error) {
    console.warn(`Error reading operations file: ${error.message}`);
    return [];
  }
}

module.exports = {
  saveOperation,
  getOperationById,
  getAllOperations
};