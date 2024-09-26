// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

contract MoonCatToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    address public taxCollector; // Moved here
    uint256 public taxRate = 100; // Moved here (Represents 1% tax where 100 is equivalent to 1%)

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event ConstructorParams(string name, string symbol, uint256 initialSupply);

    // Constructor
    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        require(_initialSupply > 0, "Initial supply must be greater than zero");

        emit ConstructorParams(_name, _symbol, _initialSupply);
        name = _name;
        symbol = _symbol;
        totalSupply = _initialSupply * (10 ** uint256(decimals));
        balanceOf[msg.sender] = totalSupply;
        taxCollector = msg.sender; // Initialize taxCollector
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address _to, uint256 _value) public returns (bool success) {
        uint256 taxAmount = (_value * taxRate) / 10000;
        uint256 amountAfterTax = _value - taxAmount;

        require(balanceOf[msg.sender] >= _value, "Insufficient balance");
        balanceOf[msg.sender] -= _value;
        balanceOf[_to] += amountAfterTax;
        balanceOf[taxCollector] += taxAmount;

        emit Transfer(msg.sender, _to, amountAfterTax);
        emit Transfer(msg.sender, taxCollector, taxAmount);
        return true;
    }

    function approve(address _spender, uint256 _value) public returns (bool success) {
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
        uint256 taxAmount = (_value * taxRate) / 10000;
        uint256 amountAfterTax = _value - taxAmount;

        require(_value <= balanceOf[_from], "Insufficient balance");
        require(_value <= allowance[_from][msg.sender], "Allowance exceeded");

        balanceOf[_from] -= _value;
        balanceOf[_to] += amountAfterTax;
        balanceOf[taxCollector] += taxAmount;
        allowance[_from][msg.sender] -= _value;

        emit Transfer(_from, _to, amountAfterTax);
        emit Transfer(_from, taxCollector, taxAmount);
        return true;
    }

    function burn(uint256 _value) public returns (bool success) {
        require(balanceOf[msg.sender] >= _value, "Insufficient balance");
        balanceOf[msg.sender] -= _value;
        totalSupply -= _value;
        emit Transfer(msg.sender, address(0), _value);
        return true;
    }
}
