const fs = require("fs");
const pth = require("path");

const packageVersions = {};

class PackageVersion
{
	static lifespan = 10000;

	constructor(path)
	{
		this.path = pth.join(path, "package.json");
		/** @type {string} */
		this.version = "";
		this.live = false;
	}

	/**
	 *
	 * @return {Promise<string>}
	 */
	getVersion()
	{
		return new Promise(resolve =>
		{
			if(this.live) resolve(this.version);
			else
			{
				fs.readFile(this.path, "utf-8", (error, data)=>
				{
					if(error) throw error;
					else
					{
						this.version = JSON.parse(data).version;
						this.live = true;
						resolve(this.version);
						setTimeout(()=>
						{
							this.live = false;
						}, PackageVersion.lifespan);
					}
				});
			}
		});
	}
}

/**
 *
 * @param {string} path
 * @return {Promise<string>}
 */
module.exports = (path)=>
{
	if(typeof packageVersions[path] === "undefined") packageVersions[path] = new PackageVersion(path);
	return packageVersions[path].getVersion();
}