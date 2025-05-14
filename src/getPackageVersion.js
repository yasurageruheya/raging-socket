const fs = require("fs");
const path = require("path");

const packageVersions = {};

class PackageVersion
{
	static lifespan = 10000;

	constructor(packageDirectoryPath)
	{
		this.path = path.join(packageDirectoryPath, "package.json");
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
 * @param {string} packageDirectoryPath
 * @return {Promise<string>}
 */
module.exports = (packageDirectoryPath)=>
{
	if(typeof packageVersions[packageDirectoryPath] === "undefined") packageVersions[packageDirectoryPath] = new PackageVersion(packageDirectoryPath);
	return packageVersions[packageDirectoryPath].getVersion();
}