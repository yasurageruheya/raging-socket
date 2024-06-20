const fs = require("fs");
const path = require("path");

/**
 *
 * @param {object} target
 * @param {string} cacheDir
 * @param {function(fileName:string, content:any):void} [onKeySet]
 * @param {WriteFileOptions|string|any} [encoding=null] encoding を省略、もしくは null を代入すると、戻り値の Promise からは Buffer が得られる
 * @return {Object.<string|Buffer|Promise<string|Buffer>>}
 */
module.exports = (target, cacheDir, encoding=null, onKeySet)=>
{
	const handler = {};
	/** @type {Promise<*>} */
	let reading = null;

	handler.set = (target, fileName, content, receiver)=>
	{
		if(target[fileName] !== content)
		{
			target[fileName] = content;
			if(onKeySet) onKeySet(fileName, content);
			fs.writeFile(path.join(cacheDir, fileName), content, encoding, (error)=>
			{
				if(error) throw error;
			});
		}
	}

	handler.get = (target, fileName, receiver)=>
	{
		if(reading) return reading;

		reading = new Promise(resolve =>
		{
			if(typeof target[fileName] !== "undefined")
			{
				reading = null;
				resolve(target[fileName]);
			}
			else
			{
				fs.readFile(path.join(cacheDir, fileName), encoding, (error, content)=>
				{
					if(error) resolve(null);
					else
					{
						target[fileName] = content;
						if(onKeySet) onKeySet(fileName, content);
						resolve(content);
					}
					reading = null;
				})
			}
		});
		return reading;
	}
	return new Proxy(target, handler);
}