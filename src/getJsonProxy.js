const fs = require("fs");

/**
 *
 * @param {object} target
 * @param {string} jsonFilePath
 * @param {function(property:string, value:any):void} [setterCallback=null]
 * @return {object}
 */
module.exports = (target, jsonFilePath, setterCallback=null)=>
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
			if(setterCallback) setterCallback(property, value);

			if(!isSaving) save();
			else isQueueSave = true;
		}
	}

	return new Proxy(target, handler);
}