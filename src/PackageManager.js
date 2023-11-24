const {createHash} = require("crypto");
const fs = require("fs");
const path = require("path");
const _root = path.join(__dirname, "../");
const jsonDir = path.join(_root, "json");
const RagingSocket = require("./RagingSocket");
const JsonDataAccessor = require("./JsonDataAccessor");
const getCacheDataProxy = require("./getCacheDataProxy");
let myPackages;

/** @type {Promise<object>} */
const packageLockJsonRead = new JsonDataAccessor(path.join(_root, "/.package-lock.json")).initialize;

/**
 * @typedef dependency
 * @property {string} version
 * @property {string} resolved
 * @property {string} integrity
 * @property {boolean} dev
 * @property {Object.<string>} requires
 */

const WriteStream = require("./WriteStream");

const tar = require("tar");
const zlib = require("zlib");
const util = require("util");

const node_modules = path.join(_root, "node_modules");
/** @type {Object.<string>} */
const packageHashFromPackages = {};
const packagesFromPackageHash = new JsonDataAccessor(path.join(jsonDir, "packagesFromPackageHash"), (property, value)=>
{
	packageHashFromPackages[value] = property;
});
packagesFromPackageHash.initialize.then(()=>
{
	for(const key in packagesFromPackageHash)
	{
		packageHashFromPackages[packagesFromPackageHash[key]] = key;
	}
});

const packageHashFromSourcecodeHash = new JsonDataAccessor(path.join(jsonDir, "packageHashFromSourcecodeHash"));



/** @type {Object.<string>} */
const sourcecodeHashFromSourcecode = {};
const sourcecodeFromSourcecodeHash = getCacheDataProxy({}, "sourcecodeFromHash", "utf-8", (property, value)=>
{
	sourcecodeHashFromSourcecode[value] = property;
});
const packageTarGzBufferCache = getCacheDataProxy({}, "packageCache");

const fsEx = require("fs-extra");

const archiveOptions = {};
archiveOptions.cwd = node_modules;
archiveOptions.sync = true;

class PackageManager
{
	constructor()
	{

	}

	initialize()
	{
		const promises = [];
		promises.push(packagesFromPackageHash.initialize);
		promises.push(packageHashFromSourcecodeHash.initialize);
		const packageInitialize = packageLockJsonRead.then(jsonProxy =>
		{
			myPackages = RagingSocket.myStatus.packages = jsonProxy;
		}).catch(error =>
		{
			console.log(error.message);
			return util.promisify(fs.readFile)("/package-lock.json", "utf-8");
		}).then(packageLockJsonText =>
		{
			if(!packageLockJsonText) return;

			const packages = {};
			const dependencies = JSON.parse(packageLockJsonText.toString()).dependencies;
			for(const key in dependencies)
			{
				if(!key.includes("@types/"))
				{
					const pkg = packages[key] = {};
					const dep = dependencies[key];
					pkg.version = dep.version;
					pkg.requires = {};
					if(typeof dep.requires !== "undefined")
					{
						for(const i in dependencies[key]["requires"])
						{
							if(!dep.requires[i].includes("@types/"))
							{
								pkg.requires[i] = dep.requires[i];
							}
						}
					}
				}
			}
			RagingSocket.myStatus.packages = getJsonProxy(packages, path.join(_root, "/.package-lock.json"));
			myPackages = RagingSocket.myStatus.packages;
		});
		promises.push(packageInitialize);

		promises.push(new Promise(()=>
		{
			//todo: ここで何をしようとしていたのか思い出す！！！
		}));

		return Promise.all(promises);
	}

	/**
	 *
	 * @param {string} sourcecode
	 * @return {string}
	 */
	getSourcecodeHashFromSourcecode(sourcecode)
	{
		return getSourcecodeHashFromSourcecode(sourcecode);
	}

	/**
	 *
	 * @param {object} packages
	 * @return {Promise<Buffer>}
	 */
	getPackageBufferFromPackages(packages)
	{
		return getPackageBufferFromPackages(packages);
	}

	/**
	 *
	 * @param {Object.<dependency>} packages
	 * @return {string}
	 */
	getPackageHashFromPackages(packages)
	{
		return getPackageHashFromPackages(packages);
	}

	/**
	 *
	 * @param {string} sourcecode
	 * @return {Promise<Buffer>}
	 */
	getPackageBufferFromSourcecode(sourcecode)
	{
		return getPackageBufferFromSourcecode(sourcecode);
	}

	/**
	 *
	 * @param {string} sourcecodeHash
	 * @return {Promise<string|Buffer>}
	 */
	getSourcecodeFromSourcecodeHash(sourcecodeHash)
	{
		return getSourcecodeFromSourcecodeHash(sourcecodeHash);
	}

	/**
	 *
	 * @param {string} sourcecode
	 * @return {Promise<Object<dependency>>}
	 */
	getPackagesFromSourcecode(sourcecode)
	{
		return getPackagesFromSourcecode(sourcecode);
	}

	/**
	 *
	 * @param {string} sourcecodeHash
	 * @return {string|null}
	 */
	getPackageHashFromSourcecodeHash(sourcecodeHash)
	{
		return getPackageHashFromSourcecodeHash(sourcecodeHash);
	}

	/**
	 *
	 * @param {string} sourcecode
	 * @return {Promise<string>}
	 */
	getPackageHashFromSourcecode(sourcecode)
	{
		return getPackageHashFromSourcecode(sourcecode);
	}

	/**
	 *
	 * @param {string} packageHash
	 * @return {Object.<dependency>|null}
	 */
	getPackagesFromPackageHash(packageHash)
	{
		return getPackagesFromPackageHash(packageHash);
	}

	/**
	 *
	 * @param {string} hash
	 * @return {Promise<Buffer>}
	 */
	getPackageBufferFromPackageHash(hash)
	{
		return packageTarGzBufferCache[hash];
	}

	/**
	 *
	 * @param {Object.<dependency>} requiredPackages
	 * @return {Object.<dependency>}
	 */
	compareRequiredPackages(requiredPackages)
	{
		compareRequiredPackages(requiredPackages);
	}

	setPackageBuffer(packageHash, tarGzBuffer)
	{
		packageTarGzBufferCache[packageHash] = tarGzBuffer;
	}
}

const getSourcecodeHashFromSourcecode = (sourcecode)=>
{
	if(typeof sourcecodeHashFromSourcecode[sourcecode] !== "undefined")
		return sourcecodeHashFromSourcecode[sourcecode];
	else
	{
		const hash = createHash("sha256").update(sourcecode).digest("base64url");
		sourcecodeFromSourcecodeHash[hash] = sourcecode;
		return hash;
	}
}

/**
 *
 * @param sourcecodeHash
 * @return {Promise<string|Buffer|null>}
 */
const getSourcecodeFromSourcecodeHash = (sourcecodeHash)=>
{
	return sourcecodeFromSourcecodeHash[sourcecodeHash];
}

/**
 *
 * @param {Object.<dependency>|string} packages
 * @return {string}
 */
const getPackageHashFromPackages = (packages)=>
{
	/** @type {string} */
	const pkg = typeof packages === "string" ? packages : JSON.stringify(packages);
	if(typeof packageHashFromPackages[pkg] !== "undefined")
		return packageHashFromPackages[pkg];
	else
	{
		const hash = createHash("sha256").update(pkg).digest("base64url");
		packagesFromPackageHash[hash] = pkg;
		return hash;
	}
}

/**
 *
 * @param {Object.<dependency>} packages
 * @return {Promise<Object.<dependency>>}
 */
const getFilteredPackages = (packages)=>
{
	return scopedPackageCheckFromDirectoryNames(Object.keys(packages)).then(directories=>
	{
		const length = directories.length;
		const filteredPackages = {};
		for(let i=0; i<length; i++)
		{
			filteredPackages[directories[i]] = packages[directories[i]];
		}
		return filteredPackages;
	});
}

/**
 *
 * @param {Object.<dependency>} requiredPackages
 * @return {Object.<dependency>}
 */
const compareRequiredPackages = (requiredPackages)=>
{
	const shortfallPackages = {};
	for(const packageName in requiredPackages)
	{
		const pkg = requiredPackages[packageName];
		if(typeof myPackages[packageName] === "undefined")
		{
			shortfallPackages[packageName] = pkg;
		}
		else if(pkg.version !== myPackages[packageName].version)
		{
			shortfallPackages[packageName] = pkg;
		}
	}
	return shortfallPackages;
}

/**
 *
 * @param {string} sourcecode
 * @return {Promise<Object.<dependency>>}
 */
const getPackageHashFromSourcecode = (sourcecode) =>
{
	return new Promise(resolve =>
	{
		const sourcecodeHash = getSourcecodeHashFromSourcecode(sourcecode);
		let packageHash = getPackageHashFromSourcecodeHash(sourcecodeHash);
		if(packageHash) return resolve(packageHash);

		getPackagesFromSourcecode(sourcecode, true).then(packages =>
		{
			packageHash = getPackageHashFromPackages(packages);
			packagesFromPackageHash[packageHash] = JSON.stringify(packages);
			packageHashFromSourcecodeHash[sourcecodeHash] = packageHash;
			resolve(packageHash);
		});
	});
}

/**
 *
 * @param {string} sourcecode
 * @param {boolean} [isForceReload=false]
 * @return {Promise<Object.<dependency>>}
 */
const getPackagesFromSourcecode = (sourcecode, isForceReload=false)=>
{
	return new Promise(resolve =>
	{
		const sourcecodeHash = getSourcecodeHashFromSourcecode(sourcecode);
		if(!isForceReload)
		{
			const packageHash = getPackageHashFromSourcecodeHash(sourcecodeHash);
			if(packageHash)
			{
				const packages = getPackagesFromPackageHash(packageHash);
				if(packages) return packages;
			}
		}

		const packages = extractPackagesFromSourcecode(sourcecode);
		getFilteredPackages(packages).then(filteredPackages =>
		{
			resolve(packages);

			//念のため、次回の getPackagesFromSourcecode へのアクセス高速化のため、キャッシュを作っておく
			const stringifiedPackages = JSON.stringify(filteredPackages);
			const packageHash = getPackageHashFromPackages(stringifiedPackages);
			packageHashFromSourcecodeHash[sourcecodeHash] = packageHash;
			packagesFromPackageHash[packageHash] = stringifiedPackages;
		});
	});
}

/**
 *
 * @param sourcecode
 * @return {Object.<dependency>}
 */
const extractPackagesFromSourcecode = (sourcecode)=>
{
	const packageNames = sourcecode.match(/require\(['"]([^'"]+)['"]\)/g)
		.map(match => match.match(/require\(['"]([^'"]+)['"]\)/)[1]);

	const myPackages = RagingSocket.myStatus.packages;
	const packages = {};

	const extractPackage = (packageName)=>
	{
		if(typeof myPackages[packageName] !== "undefined")
		{
			packages[packageName] = myPackages[packageName];
			const requires = myPackages[packageName].requires;
			for(const key in requires)
			{
				extractPackage(key);
			}
		}
	}

	packageNames.forEach(packageName=>
	{
		extractPackage(packageName);
	});

	return packages;
}

/**
 *
 * @param {string} packageHash
 * @return {Object.<dependency>|null}
 */
const getPackagesFromPackageHash = (packageHash)=>
{
	if(typeof packagesFromPackageHash[packageHash] !== "undefined")
		return packagesFromPackageHash[packageHash];
	else return null;
}

/**
 *
 * @param {string} sourcecodeHash
 * @return {string|null}
 */
const getPackageHashFromSourcecodeHash = (sourcecodeHash)=>
{
	if(typeof packageHashFromSourcecodeHash[sourcecodeHash] !== "undefined")
		return packageHashFromSourcecodeHash[sourcecodeHash];
	else return null;
}

/**
 *
 * @param {string} sourcecode
 * @return {Promise<Buffer>}
 */
const getPackageBufferFromSourcecode = (sourcecode)=>
{
	return getPackagesFromSourcecode(sourcecode).then(packages =>
	{
		return getPackageBufferFromPackages(packages);
	});
}

/**
 *
 * @param {Object.<dependency>} packages
 * @param {string} [hash=""]
 * @return {Promise<Buffer>}
 */
const getPackageBufferFromPackages = (packages, hash="")=>
{
	if(!hash) hash = getPackageHashFromPackages(packages);
	const output = new WriteStream();
	return new Promise(resolve =>
	{
		scopedPackageCheckFromDirectoryNames(Object.keys(packages)).then(directories=>
		{
			const archived = tar.c(archiveOptions, directories);

			output.on("finish", ()=>
			{
				zlib.gzip(Buffer.concat(output.buffers), (error, gzip)=>
				{
					output.delete();
					if(error) throw error;
					packageTarGzBufferCache[hash] = gzip;
					const filePath = path.join(_root, "packageCache", hash + ".tar.gz");
					fs.writeFile(filePath, gzip, (error)=>
					{
						if(error) throw error;
					});
					resolve(gzip);
				});
			});
			archived.pipe(output);
		});
	});
}

const getPackageVersion = require("./getPackageVersion");
const getJsonProxy = require("./getJsonProxy");

/**
 *
 * @param {string[]} directories
 * @return {Promise<string[]>}
 */
const scopedPackageCheckFromDirectoryNames = (directories)=>
{
	return new Promise(resolve =>
	{
		let i = directories.length;
		let processing = 0;
		while (i--)
		{
			if(directories[i].charAt(0) === "@")
			{
				if(directories[i].includes("/@types")) directories.splice(i, 1);
				else
				{
					processing++;
					const replaced = directories[i].replace("@", "_AT_");
					const orgPath = path.join(node_modules, directories[i]);
					const replacedPath = path.join(node_modules, replaced);
					fs.stat(path.join(node_modules, replaced[i]), (error)=>
					{
						if(!error)
						{
							const pOrgVersion = getPackageVersion(orgPath);
							const pCopiedVersion = getPackageVersion(replacedPath);
							let orgVersion, copiedVersion;
							pOrgVersion.then(result=>
							{
								orgVersion = result;
								return pCopiedVersion;
							}).then(result=>
							{
								copiedVersion = result;
								if(orgVersion !== copiedVersion)
								{
									fsEx.copy(orgPath, replacedPath, ()=>
									{
										directories[i] = replaced;
										if(!--processing) resolve(directories);
									});
								}
								else if(!--processing) resolve(directories);
							})
						}
						else
						{
							fsEx.copy(orgPath, replacedPath, ()=>
							{
								directories[i] = replaced;
								if(!--processing) resolve(directories);
							});
						}
					});
				}
			}
		}
		if(!processing) resolve(directories);
	});
}

module.exports = PackageManager;