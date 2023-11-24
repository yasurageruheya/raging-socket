const fs = require("fs");
const Pathurizer = require("pathurizer");
const getJsonProxy = require("./getJsonProxy");

class JsonDataAccessor
{
	/**
	 *
	 * @param {string} pathLike
	 * @param {function(property:string, value:any):void} [setterCallback]
	 */
	constructor(pathLike, setterCallback)
	{
		const parsed = Pathurizer.parse(pathLike);
		this.name = parsed.toFileNameIgnoreExtension;
		if(parsed.extension !== "json") parsed.extension = "json";
		this.path = parsed.url;
		console.log("this.path", this.path);
		/** @type {Object.<string>} */
		this.data = null;

		/** @type {Promise<object>} */
		this.initialize = new Promise(resolve =>
		{
			fs.readFile(this.path, "utf-8", (error, data)=>
			{
				if(error) throw error;
				this.data = getJsonProxy(JsonParse(data), this.path, setterCallback);
				resolve(this.data);
			});
		});
	}
}

/**
 *
 * @param {string} data
 * @return {Object.<dependencies>}
 */
const JsonParse = (data)=>
{
	try {
		return JSON.parse(data);
	} catch (error) {
		return {};
	}
}

module.exports = JsonDataAccessor;