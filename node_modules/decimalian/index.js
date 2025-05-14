const cache = {};

const toBigInt = (str, radix, digits)=>
{
	if(radix < 1 || radix > digits.length) radix = digits.length;
	const length = str.length;
	const b = cache[digits];
	str = str.split("").reverse().join("");
	let num = 0n;
	for(let i=1; i<length; i++)
	{
		num += BigInt(b[str[i]] * (radix ** i));
	}
	num += BigInt(b[str[0]]);
	return num;
}

const toString = (num, radix, digits)=>
{
	let str = "";
	if(radix < 1 || radix > digits.length) radix = digits.length;
	radix = BigInt(radix);
	while (num >= radix)
	{
		const quotient = num / radix;
		const remainder = num % radix;
		num = quotient;
		str += digits[remainder];
	}
	str += digits[num];
	return str.split("").reverse().join("");
}

/**
 *
 * @param {string} digits
 */
const prepare = (digits)=>
{
	if(typeof cache[digits] === "undefined")
	{
		const c = cache[digits] = {};
		const length = digits.length;
		for(let i=0; i<length; i++)
		{
			c[digits[i]] = i;
		}
	}
}

let _digits = "";
class Decimalian
{
	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @param {string} [digits=""]
	 */
	constructor(value, radix=0, digits="")
	{
		if(!digits) digits = _digits;
		this.digits = digits;

		if(typeof value === "string")
		{
			if(radix < 1 || radix > digits.length) radix = digits.length;
			this.bigInt = toBigInt(value, radix, digits);
		}
		else this.bigInt = BigInt(value);
	}

	/** @return {string} */
	static get digits() { return _digits };
	/** @param {string} str */
	static set digits(str)
	{
		const check = new Set(str);
		if(check.size !== str.length) throw new Error("Decimalian.digits に代入した文字列の中に重複した文字がある可能性があります。");
		prepare(str);
		_digits = str;
	}

	/** @return {string} */
	get digits() { return this._digits; }

	/** @param {string} str */
	set digits(str)
	{
		const check = new Set(str);
		if(check.size !== str.length)
		{
			const message = "引数に指定された文字列の文字数: " + str.length + " ,"+
				"ユニーク処理した後の文字列の文字数: " + check.size + " ," +
				"Decimalian インスタンスの digits プロパティに代入した文字列の中に "+(str.length-check.size)+"文字 重複した文字がある可能性があります。"+
				[...check.keys()].join("") + " は重複した文字を抜いた文字列です。使えそうだったら使ってください";
			throw new Error(message);
		}
		prepare(str);
		this._digits = str;
	}

	/**
	 *
	 * @param {string} str
	 * @param {number} [radix=0]
	 * @param {string} [digits=""]
	 * @return {Decimalian}
	 */
	static fromString(str, radix=0, digits="")
	{
		return new Decimalian(str, radix, digits);
	}

	/**
	 *
	 * @param {number} [radix=0]
	 * @return {string}
	 */
	toString(radix=0)
	{
		return toString(this.bigInt, radix, this._digits);
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	add(value, radix=0)
	{
		return new Decimalian(this.bigInt + new Decimalian(value, radix, this._digits).bigInt);
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	addSelf(value, radix)
	{
		this.bigInt += new Decimalian(value, radix, this._digits).bigInt;
		return this;
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	minus(value, radix)
	{
		return new Decimalian(this.bigInt - new Decimalian(value, radix, this._digits).bigInt);
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	minusSelf(value, radix)
	{
		this.bigInt -= new Decimalian(value, radix, this._digits).bigInt;
		return this;
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	multiply(value, radix)
	{
		return new Decimalian(this.bigInt * new Decimalian(value, radix, this._digits).bigInt);
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	multiplySelf(value, radix)
	{
		this.bigInt *= new Decimalian(value, radix, this._digits).bigInt;
		return this;
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	division(value, radix)
	{
		return new Decimalian(this.bigInt / new Decimalian(value, radix, this._digits).bigInt);
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	divisionSelf(value, radix)
	{
		this.bigInt /= new Decimalian(value, radix, this.digits).bigInt;
		return this;
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	remainder(value, radix)
	{
		return new Decimalian(this.bigInt % new Decimalian(value, radix, this._digits).bigInt);
	}

	/**
	 *
	 * @param {string|number|BigInt} value
	 * @param {number} [radix=0]
	 * @return {Decimalian}
	 */
	remainderSelf(value, radix)
	{
		this.bigInt %= new Decimalian(value, radix, this.digits).bigInt;
		return this;
	}
}

Decimalian.digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

module.exports = Decimalian;