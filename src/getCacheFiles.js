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
	/** @type {Object.<Promise<*>>} */
	const promiseCaches = {};
	/** @type {Object.<any>} */
	const contentCaches = {};

	handler.set = (target, fileName, content, receiver)=>
	{
		if(contentCaches[fileName] !== content)
		{
			contentCaches[fileName] = content;
			if(onKeySet) onKeySet(fileName, content);
			fs.writeFile(path.join(cacheDir, fileName), content, encoding, (error)=>
			{
				if(error) throw error;
			});
		}
		return true;
	}

	handler.get = (target, fileName, receiver)=>
	{
		if(typeof promiseCaches[fileName] !== "undefined") return promiseCaches[fileName];

		promiseCaches[fileName] = new Promise(resolve =>
		{
			if(typeof contentCaches[fileName] !== "undefined")
			{
				resolve(contentCaches[fileName]);
				promiseCaches[fileName] = null;
				delete promiseCaches[fileName];
			}
			else
			{
				fs.readFile(path.join(cacheDir, fileName), encoding, (error, content)=>
				{
					if(error) resolve(null);
					else
					{
						contentCaches[fileName] = content;
						if(onKeySet) onKeySet(fileName, content);
						resolve(content);
					}
					promiseCaches[fileName] = null;
					delete promiseCaches[fileName];
				})
			}
		});
		return promiseCaches[fileName];
	}
	return new Proxy(target, handler);
}