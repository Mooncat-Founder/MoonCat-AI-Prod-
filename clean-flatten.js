const fs = require('fs');
const path = require('path');

function cleanFlattenedFile(inputPath, outputPath) {
    try {
        // Read the file with explicit encoding
        const content = fs.readFileSync(inputPath, 'utf8');
        
        // Split into lines and clean each line
        const lines = content
            .split('\n')
            .map(line => line.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\uFEFF]/g, '')); // Remove special characters
        
        // Track what we've seen
        let seenSPDX = false;
        let seenPragma = false;
        const seenImports = new Set();
        
        // Clean the lines
        const cleanedLines = lines.filter(line => {
            // Trim and clean the line
            const trimmedLine = line.trim();
            
            // Skip empty lines
            if (trimmedLine === '') {
                return false;
            }
            
            // Handle SPDX
            if (trimmedLine.includes('SPDX-License-Identifier')) {
                if (seenSPDX) return false;
                seenSPDX = true;
                return true;
            }
            
            // Handle pragma
            if (trimmedLine.startsWith('pragma')) {
                if (seenPragma) return false;
                seenPragma = true;
                return true;
            }
            
            // Handle imports
            if (trimmedLine.startsWith('import')) {
                if (seenImports.has(trimmedLine)) return false;
                seenImports.add(trimmedLine);
                return true;
            }
            
            // Keep all other lines
            return true;
        });

        // Ensure proper line endings and file structure
        let cleanedContent = cleanedLines
            .join('\n')
            .replace(/\r\n/g, '\n') // Normalize line endings
            .replace(/\n\n\n+/g, '\n\n') // Remove excessive blank lines
            .trim() + '\n'; // Ensure single newline at end

        // Add license and pragma if they're missing
        if (!seenSPDX) {
            cleanedContent = '// SPDX-License-Identifier: MIT\n' + cleanedContent;
        }
        if (!seenPragma) {
            cleanedContent = cleanedContent.replace(/^/, 'pragma solidity ^0.8.27;\n');
        }

        // Write the file with explicit UTF-8 encoding
        fs.writeFileSync(outputPath, cleanedContent, { encoding: 'utf8' });
        
        // Verify the file is readable
        const testRead = fs.readFileSync(outputPath, 'utf8');
        if (testRead.length > 0) {
            console.log(`Successfully cleaned and saved: ${outputPath}`);
            
            // Log first few lines for verification
            console.log('\nFirst few lines of cleaned file:');
            console.log(testRead.split('\n').slice(0, 5).join('\n'));
        } else {
            throw new Error('File was created but appears to be empty');
        }
        
    } catch (error) {
        console.error('Error processing file:', error);
    }
}

// Function to ensure directory exists
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Main execution
const inputDir = './flattened';
const outputDir = './flattened/cleaned';

// Create output directory
ensureDirectoryExists(outputDir);

// Process each .sol file
const files = fs.readdirSync(inputDir)
    .filter(file => file.endsWith('.sol'));

if (files.length === 0) {
    console.log('No .sol files found in', inputDir);
} else {
    files.forEach(file => {
        const inputPath = path.join(inputDir, file);
        const outputPath = path.join(outputDir, file);
        console.log(`\nProcessing ${file}...`);
        cleanFlattenedFile(inputPath, outputPath);
    });
}