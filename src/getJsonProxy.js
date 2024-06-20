const fs = require("fs");

/**
 *
 * @param {object} target
 * @param {string} jsonFilePath
 * @param {function(key:string, value:any):void} [onKeySet=null]
 * @return {object}
 */
module.exports = (target, jsonFilePath, onKeySet=null)=>
{
	let isQueueSave = false;
	let isSaving = false;
	const save = ()=>
	{
		isSaving = true;
		fs.writeFile(jsonFilePath, JSON.stringify(target), "utf-8", (error)=>
		{
			if(error) throw error;
			setTimeout(()=>
			{
				isSaving = false;
				if(isQueueSave)
				{
					isQueueSave = false;
					save();
				}
			}, 100);
		});
	}
	const handler = {};
	handler.set = (target, property, value, receiver)=>
	{
		if(target[property] !== value)
		{
			target[property] = value;
			if(onKeySet) onKeySet(property, value);

			if(!isSaving) save();
			else isQueueSave = true;
		}
		return true;
	}

	const proxy = new Proxy(target, handler);
	save();
	return proxy;
}