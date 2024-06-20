const {createHash} = require("crypto");
const fs = require("fs");
const path = require("path");
const semver = require("semver");
const moduleRoot = path.join(__dirname, "../");
const Pathurizer = require("pathurizer");
const _root = process.cwd();
const TextFile = require("text-file-cache");
const Decimalian = require("decimalian");
const TreelikeMap = require("treelike-map");

const __PROJECT_SCOPE_MODULE = "__psm";

const rootCacheDir = path.join(_root, "raging-socket");
if(!fs.existsSync(rootCacheDir))
{
	try {
		fs.mkdirSync(rootCacheDir);
	} catch (error) {
		throw new Error("プロジェクトルートに RagingSocket のキャッシュフォルダー 「raging-socket」 フォルダーを作成できませんでした。\n"+
						"フォルダの書き込み権限が関係している場合は、事前に「raging-socket」フォルダーを手動で作り、その中に\n"+
						"「node_modules」「_packageCache」「_sourcecodeFromHash」の3つのフォルダーを手動で作っておいてから、\n"+
						"再度サーバーを起動してください");
	}
}

const directoryMakeError = new Error("プロジェクトルートのキャッシュフォルダー 「raging-socket」 の中に「node_modules」フォルダーを作成できませんでした。\n"+
	"フォルダの書き込み権限が関係している場合は、事前に「node_modules」「_packageCache」「_sourcecodeFromHash」の3つのフォルダーを手動で作っておいてから、\n"+
	"再度サーバーを起動してください");

const cache_node_modules = path.join(rootCacheDir, "node_modules");
if(!fs.existsSync(cache_node_modules))
{
	try {
		fs.mkdirSync(cache_node_modules);
	} catch (error) {
		throw directoryMakeError;
	}
}

const packageCacheDir = path.join(rootCacheDir, "_packageCache");
if(!fs.existsSync(packageCacheDir))
{
	try {
		fs.mkdirSync(packageCacheDir);
	} catch (error) {
		throw directoryMakeError;
	}
}

const sourcecodeFromHashDir = path.join(rootCacheDir, "_sourcecodeFromHash");
if(!fs.existsSync(sourcecodeFromHashDir))
{
	try {
		fs.mkdirSync(sourcecodeFromHashDir);
	} catch (error) {
		throw directoryMakeError;
	}
}


/** @type {typeof RagingSocket} */
let RagingSocket;

/** @type {typeof JsonDataAccessor} */
const JsonDataAccessor = require("./JsonDataAccessor");

const getCacheFiles = require("./getCacheFiles");
const getTimeLimitedCache = require("./getTimeLimitedCache");
let myPackages;

/** @type {Promise<object>} */
const dotPackageLockJsonRead = new JsonDataAccessor(path.join(_root, "/.package-lock.json")).initialize;

/**
 * @typedef dependency
 * @property {string} version
 * @property {string} resolved
 * @property {string} integrity
 * @property {boolean} dev
 * @property {Object.<string>} requires
 */

/** @type {typeof WriteStream} */
const WriteStream = require("./WriteStream");

const tar = require("tar");
const zlib = require("zlib");
const util = require("util");

const node_modules = path.join(_root, "node_modules");

/**
 *
 * @type {TreelikeMap}
 */
const promises = new TreelikeMap();

/**
 *
 * @param {object} source
 * @param {object} target
 */
const swapKeysAndValues = (source, target)=>
{
	for(const key in source)
	{
		target[source[key]] = key;
	}
}

/** @type {Object.<string>} */
const packageHashFromPackages = {};
const packagesFromPackageHash = new JsonDataAccessor(path.join(rootCacheDir, "packagesFromPackageHash"), (property, value)=>
{
	packageHashFromPackages[value] = property;
});
packagesFromPackageHash.initialize.then(()=>
{
	swapKeysAndValues(packagesFromPackageHash.data, packageHashFromPackages);
});

/** @type {Object.<string>} */
const sourcecodeHashFromModifiedSourcecodeHash = {};
/** @type {Object.<string>} */
const modifiedSourcecodeHashFromSourcecodeHash = getTimeLimitedCache(10000
 , (key, value)=>
{
	sourcecodeHashFromModifiedSourcecodeHash[value] = key;
}, (key, value)=>
{
	delete sourcecodeHashFromModifiedSourcecodeHash[value];
});

/** @type {Object.<string>} */
const pathFromModifiedSourcecodeHash = {};
/** @type {Object.<string>} */
const modifiedSourcecodeHashFromPath = getTimeLimitedCache(10000
 , (key, value)=>
{
	pathFromModifiedSourcecodeHash[value] = key;
}, (key, value)=>
{
	delete pathFromModifiedSourcecodeHash[value];
});

/** @type {Object.<string>} */
const packageHashFromModifiedSourcecodeHash = getTimeLimitedCache();

/** @type {Object.<string>} */
const modifiedSourcecodeHashesFromModifiedSourcecodeHash = getTimeLimitedCache();


/** @type {Object.<string>} */
const sourcecodeHashFromSourcecode = {};
const sourcecodeFromSourcecodeHash = getCacheFiles({}, sourcecodeFromHashDir, "utf-8", (property, value)=>
{
	sourcecodeHashFromSourcecode[value] = property;
});
const packageTarGzBufferCache = getCacheFiles({}, packageCacheDir);

const fsEx = require("fs-extra");

const archiveOptions = {};
archiveOptions.cwd = node_modules;
archiveOptions.sync = true;

const archiveOptionsVer2 = {};
archiveOptionsVer2.sync = true;

const extractOptions = {};
extractOptions.cwd = cache_node_modules;
extractOptions.onentry = entry =>
{
	entry.path = entry.path.replace("_AT_", "@");
	if(entry.path.slice(-1) === "/")
	{
		additionalModuleNames.push(entry.path.slice(0, -1));
	}
}

// nodejs Core のパッケージ名をキャッシュしておくオブジェクト
const corePackages = {};

/** @type {string[]} */
const additionalModuleNames = [];
/** @type {Promise<string>} */
const packageJsonRead = new Promise(resolve =>
{
	fs.readFile(path.join(_root, "package.json"), (error, data)=>
	{
		resolve(data);
	});
});

const projectScopeDirectoryStructure = {};
/** @type {Object.<string[]>} */
const projectScopeModulePathsFromModuleName = {};
/** @type {string[]} */
const projectScopeModulePaths = [];

class PackageManager
{
	constructor()
	{

	}

	initialize()
	{
		RagingSocket = require("./RagingSocket");
		const promises = [];
		promises.push(packagesFromPackageHash.initialize);
		promises.push(packageHashFromModifiedSourcecodeHash.initialize);

		promises.push(new Promise(resolve =>
		{
			dotPackageLockJsonRead.then(jsonProxy =>
			{
				myPackages = RagingSocket.myStatus.packages = jsonProxy;
				return util.promisify(fs.readFile)(path.join(_root, "/package-lock.json"), "utf-8");

			}).catch(error =>
			{
				throw new Error("package-lock.json が " + _root + " に見つかりませんでした");

			}).then(packageLockJsonText =>
			{
				const packages = {};
				if(typeof packageLockJsonText !== "undefined")
				{
					const packageLockJsonObj = JSON.parse(packageLockJsonText.toString());
					if(typeof packageLockJsonObj.dependencies !== "undefined")
					{
						const dependencies = packageLockJsonObj.dependencies;
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
						packages.version = 1;
					}
					else if(typeof packageLockJsonObj.packages !== "undefined")
					{
						//todo: 新バージョンの package-lock.json用の処理
						const dependencies = packageLockJsonObj.packages;
						const node_modules = "node_modules/"
						for(const key in dependencies)
						{
							const moduleName = key.slice(key.lastIndexOf(node_modules) + node_modules.length);
							if(typeof packages[moduleName] === "undefined") packages[moduleName] = {};
							const pkg = packages[moduleName];
							const mod = dependencies[key];
							if(typeof pkg[mod.version] === "undefined")
							{
								pkg[mod.version] = {};
								const obj = pkg[mod.version];
								obj.src = key;
								obj.version = mod.version;
								if(mod.dependencies) obj.dependencies = mod.dependencies;
								if(mod.devDependencies) obj.devDependencies = mod.devDependencies;
								if(mod.optionalDependencies) obj.optionalDependencies = mod.optionalDependencies;
								if(mod.peerDependencies) obj.peerDependencies = mod.peerDependencies;
								if(mod.bin) obj.bin = mod.bin;
							}
						}
						packages.version = 2;
					}

					for(const key in packages)
					{
						if(key) myPackages[key] = packages[key];
					}
				}

				return packageJsonRead;
			}).then(packageJsonText =>
			{
				//todo: package-lock.json の内容だけで処理できるんじゃないかな、と思う。旧バージョンの package-lock.json の中身をいつかチェックしたい
				const packageJson = JSON.parse(packageJsonText);
				const dependencies = packageJson.dependencies;
				const devDependencies = packageJson.devDependencies;
				for(const moduleName in dependencies)
				{
					additionalModuleNames.push(moduleName);
				}
				for(const moduleName in devDependencies)
				{
					additionalModuleNames.push(moduleName);
				}
				resolve();
			});
		}));

		promises.push(new Promise(resolve =>
		{
			const projectScopeRootPath = RagingSocket.options.projectScopeRootPath;
			if(projectScopeRootPath)
			{
				let pending = 0;
				const projectScopeRootPathLength = projectScopeRootPath.length + 1;
				const readdir = (dirPath, obj)=>
				{
					pending++;
					fs.readdir(dirPath, (error, files)=>
					{
						--pending;
						if(error) throw error;

						const length = files.length;
						pending += length;
						for(let i=0; i<length; i++)
						{
							const target = files[i];
							const targetPath = path.join(dirPath, target);
							fs.stat(targetPath, (error, stats)=>
							{
								if(stats.isDirectory())
								{
									obj[target] = {};
									readdir(targetPath, obj[target]);
								}
								else
								{
									obj[target] = targetPath;
									if(typeof projectScopeModulePathsFromModuleName[target] === "undefined")
										projectScopeModulePathsFromModuleName[target] = [];

									projectScopeModulePathsFromModuleName[target].push(targetPath);
									projectScopeModulePaths.push(targetPath);
								}

								if(!--pending)
									resolve();
							});
						}
					})
				}

				readdir(projectScopeRootPath, projectScopeDirectoryStructure);
			}
		}))

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

	getModifiedSourcecodeFromJsPath(jsPath)
	{
		return getModifiedSourcecodeFromJsPath(jsPath);
	}


	getModifiedSourcecodeHashesFromJsPath(jsPath)
	{
		return getModifiedSourcecodeHashFromJsPath(jsPath);
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
	 * @param {string} jsPath
	 * @return {Promise<Object.<dependency>>}
	 */
	getPackagesFromJsPath(jsPath)
	{
		return getPackagesFromJsPath(jsPath);
	}

	/**
	 *
	 * @param {string} sourcecode
	 * @param {string} [jsPath=""]
	 * @return {Promise<Object<dependency>>}
	 */
	getPackagesFromSourcecode(sourcecode, jsPath="")
	{
		return getPackagesFromSourcecode(sourcecode, [], jsPath);
	}

	/**
	 *
	 * @param {string} sourcecodeHash
	 * @return {string|null}
	 */
	getPackageHashFromSourcecodeHash(sourcecodeHash)
	{
		return getPackageHashFromModifiedSourcecodeHash(sourcecodeHash);
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
		return compareRequiredPackages(requiredPackages);
	}

	setPackageBuffer(packageHash, tarGzBuffer)
	{
		packageTarGzBufferCache[packageHash] = tarGzBuffer;
		return new Promise(resolve =>
		{
			zlib.gunzip(tarGzBuffer, (error, buffer)=>
			{
				if(error) throw error;

				const extractor = tar.extract(extractOptions);
				extractor.on("error", error =>
				{
					console.error(error);
				})
				extractor.on("end", ()=>
				{
					resolve();
				});

				extractor.end(buffer);
			})
		})
	}
}

/**
 *
 * @param args
 * @return {{already: boolean, map: TreelikeMap}}
 */
const getTreelikeMap = (...args)=>
{
	let promiseObj = promises;
	const length = args.length;
	let already = true;
	for(let i = 0; i < length; i++)
	{
		const arg = args[i];
		if(promiseObj.has(arg))
		{
			promiseObj = promiseObj.get(arg);
		}
		else
		{
			promiseObj = promiseObj.set(arg).get(arg);
			already = false;
		}
	}
	return {map:promiseObj, already: already};
}

const getPackagesFromJsPath = (jsPath)=>
{
	const response = getTreelikeMap(getPackagesFromJsPath, jsPath);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			TextFile.getTextFile(jsPath).content.then(sourcecode =>
			{
				return getPackagesFromSourcecode(sourcecode, [], Pathurizer.parse(jsPath).toDirectories);
			}).then(packages =>
			{
				resolve(packages);
				response.map.parent.remove(jsPath, true);
			});
		});
	}
	return response.map.value;
}

const getModifiedSourcecodeFromJsPath = (jsPath)=>
{
	const response = getTreelikeMap(getModifiedSourcecodeFromJsPath, jsPath);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			TextFile.getTextFile(jsPath).content.then(sourcecode=>
			{
				return getModifiedSourcecodeFromSourcecode(sourcecode);

			}).then(modifiedSourcecode =>
			{
				resolve(modifiedSourcecode);
				response.map.parent.remove(jsPath, true);
			});
		});
	}

	return response.map.value;
}

/**
 *
 * @param {string} jsPath
 * @return {Promise<string>}
 */
const getModifiedSourcecodeHashFromJsPath = (jsPath)=>
{
	const response = getTreelikeMap(getModifiedSourcecodeHashFromJsPath, jsPath);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			TextFile.getTextFile(jsPath).content.then(sourcecode =>
			{
				return getModifiedSourcecodeHashFromSourcecode(sourcecode, [], jsPath);

			}).then(modifiedSourcecodeHash=>
			{
				resolve(modifiedSourcecodeHash);
				response.map.parent.remove(jsPath, true);
			});
		});
	}

	return response.map.value;
}
/**
 *
 * @param {string} sourcecode
 * @param {Function[]} history
 * @param {string} [jsPath=""]
 * @return {Promise.<string>}
 */
const getModifiedSourcecodeHashFromSourcecode = (sourcecode, history, jsPath="")=>
{
	const isLooped = history.includes(getModifiedSourcecodeHashFromSourcecode);
	const response = getTreelikeMap(getModifiedSourcecodeHashFromSourcecode, isLooped, sourcecode);
	history.push(getModifiedSourcecodeHashFromSourcecode);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			const sourcecodeHash = getSourcecodeHashFromSourcecode(sourcecode);
			const modifiedSourcecodeHash = getModifiedSourcecodeHashFromSourcecodeHash(sourcecodeHash);
			if(modifiedSourcecodeHash)
			{
				removeResponse(response, sourcecode, isLooped);
				return resolve(modifiedSourcecodeHash);
			}

			getModifiedSourcecodeFromSourcecode(sourcecode, history, jsPath).then(modifiedSourcecode=>
			{
				const modifiedSourcecodeHash = getSourcecodeHashFromSourcecode(modifiedSourcecode);
				modifiedSourcecodeHashFromSourcecodeHash[sourcecodeHash] = modifiedSourcecode;
				removeResponse(response, sourcecode, isLooped);
				resolve(modifiedSourcecodeHash);
			});
		});
	}

	return response.map.value;
}

/**
 *
 * @param {string} modifiedSourcecodeHash
 * @return {null|string}
 */
const getPackageHashFromModifiedSourcecodeHash = (modifiedSourcecodeHash)=>
{
	if(typeof packageHashFromModifiedSourcecodeHash[modifiedSourcecodeHash] !== "undefined")
		return packageHashFromModifiedSourcecodeHash[modifiedSourcecodeHash];
	else return null;
}

/**
 *
 * @param modifiedSourcecodeHash {string}
 * @return {null|string}
 */
const getPackagesFromModifiedSourcecodeHash = (modifiedSourcecodeHash)=>
{
	const packageHash = getPackageHashFromModifiedSourcecodeHash(modifiedSourcecodeHash);
	if(packageHash)
	{
		if(typeof packagesFromPackageHash.data[packageHash] !== "undefined")
			return packagesFromPackageHash.data[packageHash];
	}
	return null;
}

/**
 *
 * @param {string} sourcecodeHash
 * @return {null|string}
 */
const getModifiedSourcecodeHashFromSourcecodeHash = (sourcecodeHash)=>
{
	if(typeof modifiedSourcecodeHashFromSourcecodeHash[sourcecodeHash] !== "undefined")
		return modifiedSourcecodeHashFromSourcecodeHash[sourcecodeHash];
	else return null;
}

/**
 *
 * @param sourcecode {string}
 * @return {string}
 */
const getSourcecodeHashFromSourcecode = (sourcecode)=>
{
	if(typeof sourcecodeHashFromSourcecode[sourcecode] !== "undefined")
		return sourcecodeHashFromSourcecode[sourcecode];
	else
	{
		const hash = createHash("sha256").update(sourcecode).digest("hex");
		const shortHash = Decimalian.fromString(hash, 16).toString() + ".js";
		sourcecodeFromSourcecodeHash[shortHash] = sourcecode;
		return shortHash;
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
		const hash = createHash("sha256").update(pkg).digest("hex");
		const shortHash = Decimalian.fromString(hash, 16).toString();
		packagesFromPackageHash.data[shortHash] = pkg;
		return shortHash;
	}
}

/**
 *
 * @param {Object.<dependency>} packages
 * @return {Promise<Object.<dependency>>}
 */
const getFilteredPackages = (packages)=>
{
	const key = JSON.stringify(packages);
	const response = getTreelikeMap(getFilteredPackages, key);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			scopedPackageCheckFromDirectoryNames(Object.keys(packages)).then(directories=>
			{
				const length = directories.length;
				const filteredPackages = {};
				for(let i=0; i<length; i++)
				{
					filteredPackages[directories[i]] = packages[directories[i]];
				}
				resolve(filteredPackages);
				response.map.parent.remove(key);
			});
		});
	}

	return response.map.value;
}

/**
 *
 * @param {Object.<dependency>} requiredPackages
 * @return {Object.<dependency>}
 */
const compareRequiredPackages = (requiredPackages)=>
{
	const shortfallPackages = {};
	if(typeof requiredPackages === "string") requiredPackages = JSON.parse(requiredPackages);
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
 * @param {TreelikeMap} response
 * @param {any} key
 * @param {any} parentKey
 */
const removeResponse = (response, key, parentKey)=>
{
	if(typeof parentKey !== "undefined")
	{
		const grandparent = response.map.parent.parent;
		response.map.parent.remove(key);
		if(grandparent.size === 1) grandparent.remove(parentKey, true);
	}
	else
	{
		response.map.parent.remove(key);
	}
}

/**
 *
 * @param {string} sourcecode
 * @param {string} [jsPath=""]
 * @return {Promise<Object.<dependency>>}
 */
const getPackageHashFromSourcecode = (sourcecode, jsPath="") =>
{
	const response = getTreelikeMap(getPackageHashFromSourcecode, sourcecode, jsPath);
	if(!response.already)
	{
		response.map.value = new Promise((resolve, reject) =>
		{
			getModifiedSourcecodeHashFromSourcecode(sourcecode, [], jsPath).then(modifiedSourcecodeHash=>
			{
				const packageHash = getPackageHashFromModifiedSourcecodeHash(modifiedSourcecodeHash);
				if(packageHash)
				{
					removeResponse(jsPath, sourcecode);
					return resolve(packageHash);
				}

				getModifiedSourcecodeFromSourcecodeHash(modifiedSourcecodeHash).then(modifiedSourcecode=>
				{
					if (modifiedSourcecode)
						return getPackagesFromModifiedSourcecode(modifiedSourcecode, jsPath);
					else
						return getPackagesFromSourcecode(sourcecode, [], jsPath);
				}).then(packages=>
				{
					const packageHash = getPackageHashFromPackages(packages);
					resolve(packageHash);
					removeResponse(jsPath, sourcecode);
				});
			});
		});
	}

	return response.map.value;
}

/**
 *
 * @param {string} sourcecodeHash
 * @return {Promise<string|null>}
 */
const getModifiedSourcecodeFromSourcecodeHash = (sourcecodeHash)=>
{
	const response = getTreelikeMap(sourcecodeHash);
	if(!response.already)
	{
		response.map.value = new Promise(resolve=>
		{
			const modifiedSourcecodeHash = getModifiedSourcecodeHashFromSourcecodeHash(sourcecodeHash);
			if(modifiedSourcecodeHash)
			{
				getSourcecodeFromSourcecodeHash(modifiedSourcecodeHash).then(modifiedSourcecode=>
				{
					if(modifiedSourcecode) resolve(modifiedSourcecode);
					else resolve(null);

					response.map.parent.remove(sourcecodeHash);
				});
			}
			resolve(null);
			response.map.parent.remove(sourcecodeHash);
		});
	}
	return response.map.value;
}

/**
 *
 * @param {string} sourcecode
 * @param {Function[]} history
 * @param {string} [jsPath=""]
 * @return {Promise<string|null>}
 */
const getModifiedSourcecodeFromSourcecode = (sourcecode, history, jsPath="")=>
{
	const isLooped = history.includes(getModifiedSourcecodeFromSourcecode);
	const response = getTreelikeMap(getModifiedSourcecodeFromSourcecode, isLooped, sourcecode, jsPath);
	history.push(getModifiedSourcecodeFromSourcecode);
	if(!response.already)
	{
		response.map.value = new Promise(resolve=>
		{
			const sourcecodeHash = getSourcecodeHashFromSourcecode(sourcecode);
			getModifiedSourcecodeFromSourcecodeHash(sourcecodeHash).then(modifiedSourcecode=>
			{
				if(!modifiedSourcecode)
				{
					extractPackagesFromSourcecode(sourcecode, jsPath).then(result=>
					{
						const modifiedSourcecode = result.sourcecode;
						resolve(modifiedSourcecode);
						removeResponse(response, jsPath, sourcecode, isLooped);
					})
				}
				else
				{
					resolve(modifiedSourcecode);
					removeResponse(response, jsPath, sourcecode, isLooped);
				}
			})
		})
	}
	return response.map.value;
}

/**
 *
 * @param {string} modifiedSourcecode
 * @param {string} [jsPath=""]
 * @return {Promise<Object.<dependency>>}
 */
const getPackagesFromModifiedSourcecode = (modifiedSourcecode, jsPath="")=>
{
	const response = getTreelikeMap(getPackagesFromModifiedSourcecode, jsPath, modifiedSourcecode);
	if(!response.already)
	{
		response.map.value = new Promise(resolve=>
		{
			const modifiedSourcecodeHash = getModifiedSourcecodeHashFromModifiedSourcecode(modifiedSourcecode, jsPath);
			const packageHash = getPackageHashFromModifiedSourcecodeHash(modifiedSourcecodeHash);
			if(packageHash)
			{
				const packages = getPackagesFromPackageHash(packageHash);
				if(packages)
				{
					removeResponse(jsPath, sourcecode);
					return resolve(packages);
				}
			}

			extractPackagesFromSourcecode(modifiedSourcecode, jsPath).then(result=>
			{
				return onExtractedPackagesFromSourcecode(result);

			}).then(packages =>
			{
				removeResponse(jsPath, sourcecode);

				// ▼ extractPackagesFromSourcecode() で package キャッシュを作っているので、ここでキャッシュを作らなくても大丈夫
				// packagesFromPackageHash.data[getPackageHashFromPackages(packages)] = JSON.stringify(packages);
				resolve(packages);
			})
		});
	}
	return response.map.value;
}

const getModifiedSourcecodeHashFromModifiedSourcecode = (modifiedSourcecode)=>
{
	return getSourcecodeHashFromSourcecode(modifiedSourcecode);
}

/**
 * @param {string} sourcecode
 * @param {Function[]} history
 * @param {string} [jsPath=""]
 * @return {Promise<Object.<dependency>>}
 */
const getPackagesFromSourcecode = (sourcecode, history, jsPath="")=>
{
	const isLooped = history.includes(getPackagesFromSourcecode);
	const response = getTreelikeMap(getPackagesFromSourcecode, isLooped, jsPath);
	history.push(getPackagesFromSourcecode);
	if(!response.already)
	{
		response.map.value = new Promise(resolve=>
		{
			new Promise(resolve1 =>
			{
				if(!history.includes(getModifiedSourcecodeHashFromSourcecode))
				{
					getModifiedSourcecodeHashFromSourcecode(sourcecode, history, jsPath).then(modifiedSourcecodeHash=>
					{
						const packageHash = getPackageHashFromModifiedSourcecodeHash(modifiedSourcecodeHash);
						if(packageHash)
						{
							const packages = getPackagesFromPackageHash(packageHash);
							if(packages) resolve1(packages);
						}
						else resolve1(null);
					});
				}
				else resolve1(null);
			}).then(packages=>
			{
				if(!packages)
				{
					extractPackagesFromSourcecode(sourcecode).then(result =>
					{
						return onExtractedPackagesFromSourcecode(result);
					}).then(packages=>
					{
						resolve(packages);
						removeResponse(jsPath, isLooped);
					});
				}
				else
				{
					resolve(packages);
					removeResponse(jsPath, isLooped);
				}
			});
		});
	}
	return response.map.value;
}

/**
 *
 * @param {{packages:Object.<dependency>, sourcecode:string}} result
 * @return {Promise<Object.<dependency>>}
 */
const onExtractedPackagesFromSourcecode = (result)=>
{
	const key = JSON.stringify(result);
	const response = getTreelikeMap(onExtractedPackagesFromSourcecode, key);
	if(!response.already)
	{
		response.map.value = new Promise(resolve=>
		{
			const {packages, sourcecode} = result;
			const sourcecodeHash = getSourcecodeHashFromSourcecode(sourcecode);
			if(packages.version === 1)
			{
				getFilteredPackages(packages).then(filteredPackages =>
				{
					resolve(filteredPackages);
					createPackageCache(filteredPackages, sourcecodeHash);

					response.map.parent.remove(key, true);
				});
			}
			else if(packages.version === 2)
			{
				resolve(packages);
				createPackageCache(packages, sourcecodeHash);

				response.map.parent.remove(key, true);
			}
		});
	}
	return response.map.value;
}

const createPackageCache = (packages, sourcecodeHash)=>
{
	const stringifiedPackages = JSON.stringify(packages);
	const packageHash = getPackageHashFromPackages(stringifiedPackages);
	packageHashFromModifiedSourcecodeHash[sourcecodeHash] = packageHash;
	packagesFromPackageHash.data[packageHash] = stringifiedPackages;
}

/**
 *
 * @param {string} sourcecode
 * @param {string} [jsPath=""]
 * @return {Promise<{packages:Object.<dependency>, sourcecode:string}>}
 */
const extractPackagesFromSourcecode = (sourcecode, jsPath="")=>
{
	const response = getTreelikeMap(extractPackagesFromSourcecode, sourcecode, jsPath);
	if(!response.already)
	{
		response.map.value = new Promise((resolve)=>
		{
			const packageNames = sourcecode.match(/require\(['"]([^'"]+)['"]\)/g)
				.map(match => match.match(/require\(['"]([^'"]+)['"]\)/)[1]);

			const packages = {};
			packages.version = myPackages.version;
			packages[__PROJECT_SCOPE_MODULE] = [];

			if(packages.version === 1)
			{
				packageNames.forEach(packageName =>
				{
					extractPackageVer1(packages, packageName);
				});
				resolve(packages);
				removeResponse(response, jsPath, sourcecode);
			}
			else if(packages.version === 2)
			{
				const promises = [];
				packageNames.forEach(packageName =>
				{
					promises.push(extractPackageVer2(packages, packageName, jsPath));
				});
				Promise.allSettled(promises).then((values)=>
				{
					const reasons = [];
					for(const result of values)
					{
						if(result.status === "rejected") reasons.push(result.reason);
						else
						{
							if(typeof result.value !== "undefined" && typeof result.value.packageName !== "undefined")
								sourcecode = sourcecode.split(result.value.packageName).join("./"+result.value.modifiedSourcecodeHash);
						}
					}
					if(reasons.length) throw new Error(reasons.join(", "));
					else resolve({packages, sourcecode});

					removeResponse(response, jsPath, sourcecode);
				});
			}
			else
			{
				throw new Error("myPackages に version データが無い状態でバージョン分岐の処理に到達しました");
			}
		});
	}
	return response.map.value;
}

/**
 * todo: プロジェクト内のモジュールの検索も行わなければならない
 * @param {Object.<dependency>} packages
 * @param {string} packageName
 */
const extractPackageVer1 = (packages, packageName)=>
{
	if(typeof myPackages[packageName] !== "undefined")
	{
		packages[packageName] = myPackages[packageName];
		const requires = myPackages[packageName].requires;
		for(const key in requires)
		{
			extractPackageVer1(packages, key);
		}
	}
}

const getRootModule = (pkg)=>
{
	for(const version in pkg)
	{
		const mod = pkg[version];
		if(mod.src.split("/").length <= 3)
		{
			return mod;
		}
	}
	throw new Error("多分 npm install でインストールされていないライブラリを利用しているソースコードをクライアントに送信しようとしている気がします");
}

/**
 * todo: これを作れたら便利そうだけど特定の修正済みソースコードハッシュをキーとして必要な全修正済みソースコードのハッシュ群をどうやって作る？？？？
 * @param modifiedSourcecodeHash
 * @return {null|string}
 */
const getModifiedSourceHashesFromModifiedSourcecodeHash = (modifiedSourcecodeHash)=>
{
	if(typeof modifiedSourcecodeHashesFromModifiedSourcecodeHash[modifiedSourcecodeHash] !== "undefined")
		return modifiedSourcecodeHashesFromModifiedSourcecodeHash[modifiedSourcecodeHash];
	else return null;
}

/**
 *
 * @param {Object.<dependency>} packages
 * @param {string} packageName
 * @param {string} [jsPath=""]
 * @return {Promise<{packageName:string, modifiedSourcecodeHash:string}>}
 */
const extractPackageVer2 = (packages, packageName, jsPath="")=>
{
	const response = getTreelikeMap(extractPackageVer2, packageName, jsPath);
	if(!response.already)
	{
		response.map.value = new Promise((resolve, reject)=>
		{
			if(typeof myPackages[packageName] !== "undefined")
			{
				const pkg = myPackages[packageName];

				const mod = getRootModule(pkg);
				if(typeof packages[packageName] === "undefined") packages[packageName] = {};
				const versions = packages[packageName];
				const version = mod.version;
				if(typeof versions[version] === "undefined")
				{
					const obj = versions[version] = {};
					obj.version = mod.version;
					obj.src = mod.src;
					if(typeof mod.bin !== "undefined") obj.bin = mod.bin;
				}

				getSubModule(packages, mod);
				resolve();
				removeResponse(jsPath, packageName);
			}
			else
			{
				if(packageName.charAt(0) === ".")
				{
					const modulePath = (()=>
					{
						if(jsPath) return path.join(jsPath, packageName);
						else
						{
							const psmPath = getProjectScopeModulePath(packageName);
							const projectScopeRootPath = RagingSocket.options.projectScopeRootPath;
							return path.join(projectScopeRootPath, psmPath);
						}
					})();

					TextFile.getTextFile(modulePath).content.then(moduleSourcecode=>
					{
						const newPath = modulePath.join("../");
						return getModifiedSourcecodeHashFromSourcecode(moduleSourcecode, [], newPath);

					}).then(modifiedSourcecodeHash=>
					{
						packages[__PROJECT_SCOPE_MODULE].push(modifiedSourcecodeHash);
						resolve({packageName, modifiedSourcecodeHash});
						removeResponse(jsPath, packageName);
					}).catch(error=>
					{
						removeResponse(jsPath, packageName);
						throw error;
					});
				}
				else if(packageName.charAt(0) === "/")
				{
					const modulePath = path.resolve(packageName);
					getModifiedSourcecodeHashFromJsPath(modulePath).then((modifiedSourcecodeHash)=>
					{
						packages[__PROJECT_SCOPE_MODULE].push(modifiedSourcecodeHash);
						resolve({packageName, modifiedSourcecodeHash});
						removeResponse(jsPath, packageName);
					})
				}
				else if(typeof corePackages[packageName] === "undefined")
				{
					if(require.resolve.paths(packageName) === null)
					{
						corePackages[packageName] = 1;
						resolve();
						removeResponse(jsPath, packageName);
					}
					else
					{
						reject("サーバー側にあるパッケージから必要なパッケージを検索してみましたが、"+packageName+" というパッケージが見つからないみたいです");
						removeResponse(jsPath, packageName);
					}
				}
			}
		});
	}

	return response.map.value;
}

/**
 *
 * @param {string} moduleName
 * @return {string}
 */
const getProjectScopeModulePath = (moduleName)=>
{
	const lastSlashIndex = moduleName.lastIndexOf("/");
	if(lastSlashIndex < 0)
		throw new Error("RagingSocket は require メソッドの引数のモジュール名の指定で「.（ドット）」から始まるのに、「/（スラッシュ）」が含まれていない文字列の解析に対応出来ていません");

	const name = moduleName.slice(lastSlashIndex);
	const modules = getModulePathFromModuleName(name);
	if(!modules || !modules.length) throw new Error(name + "が見つかりませんでした");
	else if(modules.length === 1) return modules[0];
	else
	{
		const normalizedPath = ((name)=>
		{
			let finished = 1;
			while (!finished)
			{
				finished = 2;
				if(name.slice(0, 3) === "../") name = name.slice(3);
				else --finished;

				if(name.slice(0, 2) === "./") name = name.slice(2);
				else --finished;
			}
			return path.normalize(name);
		})(name);
		const found = [];
		const length = projectScopeModulePaths.length;
		for(let i=0; i<length; i++)
		{
			if(projectScopeModulePaths[i].includes(normalizedPath))
				found.push(projectScopeModulePaths[i]);
		}

		if(found.length === 1) return found[0];
		else if(!found.length) throw new Error(name + " という名前のモジュールが複数見つかりましたが、" + moduleName + " というパスが解決できませんでした");
		else throw new Error(name + " という名前のモジュールが複数見つかりましたが、" + moduleName + " というパスでも、複数のモジュールに辿り着いてしまったため、モジュールが特定できませんでした")
	}
}

/**
 *
 * @param {string} moduleName
 * @return {string[]}
 */
const getModulePathFromModuleName = (moduleName) =>
{
	return projectScopeModulePathsFromModuleName[moduleName] ||
		projectScopeModulePathsFromModuleName[moduleName+".js"] ||
		projectScopeModulePathsFromModuleName[moduleName+".json"] ||
		projectScopeModulePathsFromModuleName[moduleName+".node"];
}

const dependentCategories =
	[
		"dependencies",
		"devDependencies",
		"optionalDependencies",
		"peerDependencies"
	];

const getSubModule = (packages, module)=>
{
	const length = dependentCategories.length;
	for(let i=0; i<length; i++)
	{
		checkSubModule(packages, module, dependentCategories[i]);
	}
}

const checkSubModule = (packages, module, dependentCategory)=>
{
	if(typeof module[dependentCategory] !== "undefined")
	{
		for(const packageName in module[dependentCategory])
		{
			const versionRange = module[dependentCategory][packageName];
			extractPackageVer2_2(packages, versionRange, packageName);
		}
	}
}

const extractPackageVer2_2 = (packages, versionRange, packageName) =>
{
	const pkg = myPackages[packageName];
	for(const version in pkg)
	{
		if(semver.satisfies(version, versionRange))
		{
			const mod = pkg[version];
			if(typeof packages[packageName] === "undefined") packages[packageName] = {};
			const versions = packages[packageName];
			if(typeof versions[version] === "undefined")
			{
				const obj = versions[version] = {};
				obj.version = version;
				obj.src = mod.src;
			}
			return getSubModule(packages, mod);
		}
	}
	throw new Error("サーバー側にあるパッケージから必要なパッケージを検索してみたところ、必要なパッケージの存在は確認しましたが、必要なバージョンが見つからないみたいです");
}

/**
 *
 * @param {string} packageHash
 * @return {Object.<dependency>|null}
 */
const getPackagesFromPackageHash = (packageHash)=>
{
	if(typeof packagesFromPackageHash.data[packageHash] !== "undefined")
		return packagesFromPackageHash.data[packageHash];
	else return null;
}

/**
 *
 * @param {string} sourcecode
 * @param {string} [jsPath=""]
 * @return {Promise<Buffer>}
 */
const getPackageBufferFromSourcecode = (sourcecode, jsPath="")=>
{
	const response = getTreelikeMap(getPackageBufferFromSourcecode, sourcecode, jsPath);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			getPackagesFromSourcecode(sourcecode, [], jsPath).then(packages =>
			{
				return getPackageBufferFromPackages(packages);
			}).then(buffer=>
			{
				resolve(buffer);

				removeResponse(jsPath, sourcecode);
			});
		})
	}
	return response.map.value;
}

/**
 *
 * @param {Object.<dependency>} packages
 * @return {Promise<Buffer>}
 */
const getPackageBufferFromPackages = (packages)=>
{
	const hash = getPackageHashFromPackages(packages);
	const response = getTreelikeMap(getPackageBufferFromPackages, hash);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			const output = new WriteStream();
			const pkg = JSON.parse(JSON.stringify(packages));
			const psm = pkg[__PROJECT_SCOPE_MODULE];
			delete pkg[__PROJECT_SCOPE_MODULE];
			if(pkg.version === 1)
			{
				scopedPackageCheckFromDirectoryNames(Object.keys(pkg)).then(directories=>
				{
					for(const sourcecodeHash in psm)
					{
						directories.push(path.join(sourcecodeFromHashDir, sourcecodeHash));
					}
					const archived = tar.c(archiveOptions, directories);

					output.once("finish", ()=>
					{
						zlib.gzip(Buffer.concat(output.buffers), (error, gzip)=>
						{
							output.delete();
							if(error) throw error;
							packageTarGzBufferCache[hash] = gzip;
							const filePath = path.join(packageCacheDir, hash + ".tar.gz");
							fs.writeFile(filePath, gzip, (error)=>
							{
								if(error) throw error;
							});
							resolve(gzip);
							response.map.parent.remove(hash, true);
						});
					});
					archived.pipe(output);
				});
			}
			else if(pkg.version === 2)
			{
				scopedPackageCheckFromDirectoryNamesVer2(pkg).then(directories =>
				{
					for(const sourcecodeHash in psm)
					{
						directories.push(path.join(sourcecodeFromHashDir, sourcecodeHash));
					}
					const archived = tar.c(archiveOptionsVer2, directories);

					output.once("finish", ()=>
					{
						zlib.gzip(Buffer.concat(output.buffers), (error, gzip)=>
						{
							output.delete();
							if(error) throw error;
							packageTarGzBufferCache[hash] = gzip;
							const filePath = path.join(packageCacheDir, hash + ".tar.gz");
							fs.writeFile(filePath, gzip, (error)=>
							{
								if(error) throw error;
							});
							resolve(gzip);
							response.map.parent.remove(hash, true);
						});
					});
					archived.pipe(output);
				});
			}
			else
			{
				response.map.parent.remove(hash, true);
				throw new Error("変数 packages にバージョン番号が付けられないまま処理が進んでます");
			}
		});
	}
	return response.map.value;
}

const getPackageVersion = require("./getPackageVersion");

/**
 *
 * @param {string[]} directories
 * @return {Promise<string[]>}
 */
const scopedPackageCheckFromDirectoryNames = (directories)=>
{
	const key = directories.join();
	const response = getTreelikeMap(scopedPackageCheckFromDirectoryNames, key);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			const end = (directories)=>
			{
				resolve(directories);
				response.map.parent.remove(key);
			}
			let i = directories.length;
			let processing = 0;
			//todo: ".bin"ディレクトリの中をどう送信すればいいか分からない
			while (i--)
			{
				if(directories[i].charAt(0) === "@")
				{
					if(directories[i].includes("/@types")) directories.splice(i, 1);
					//todo: fsevents モジュールは Windows ではいらないモジュールらしいが、Macでは必要らしい。Windows と Mac 同士で RagingSocket したい時にはこのままだと出来ないのかもしれない
					else if(directories[i] === "fsevents") directories.splice(i, 1);
					else
					{
						processing++;
						const replaced = directories[i].replace("@", "_AT_");
						const orgPath = path.join(node_modules, directories[i]);
						const replacedPath = path.join(node_modules, replaced);
						fs.stat(replacedPath, (error)=>
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
											if(!--processing) end(directories);
										});
									}
									else if(!--processing) end(directories);
								})
							}
							else
							{
								fsEx.copy(orgPath, replacedPath, ()=>
								{
									directories[i] = replaced;
									if(!--processing) end(directories);
								});
							}
						});
					}
				}
			}
			if(!processing) end(directories);
		});
	}
	return response.map.value;
}

const binDir = path.join(node_modules, ".bin");

/**
 *
 * @param {Object.<dependency>} packages
 * @return {Promise<string[]>}
 */
const scopedPackageCheckFromDirectoryNamesVer2 = (packages)=>
{
	const key = JSON.stringify(packages);
	const response = getTreelikeMap(scopedPackageCheckFromDirectoryNamesVer2, key);
	if(!response.already)
	{
		response.map.value = new Promise(resolve =>
		{
			const end = (directories)=>
			{
				resolve(directories);
				response.map.parent.remove(key);
			}
			let processing = 0;
			const directories = [];
			for(const packageName in packages)
			{
				//todo: fsevents モジュールは Windows ではいらないモジュールらしいが、Macでは必要らしい。Windows と Mac 同士で RagingSocket したい時にはこのままだと出来ないのかもしれない
				if(packageName === "fsevents") continue;

				const versions = packages[packageName];
				for(const version in versions)
				{
					processing++;
					const mod = versions[version];
					const replaced = mod.src.replace("@", "_AT_");
					const orgPath = path.join(node_modules, mod.src);
					const replacedPath = path.join(node_modules, replaced);
					directories.push(replacedPath);
					fs.stat(replacedPath, (error) =>
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
										if(!--processing) end(directories);
									});
								}
								else if(!--processing) end(directories);
							});
						}
						else
						{
							fsEx.copy(orgPath, replacedPath, ()=>
							{
								if(!--processing) end(directories);
							});
						}
					});

					if(typeof mod.bin !== "undefined")
					{
						for(const key in mod.bin)
						{
							directories.push(path.join(binDir, key));
							directories.push(path.join(binDir, key + ".cmd"));
							directories.push(path.join(binDir, key + ".ps1"));
						}
					}
				}
			}
			if(!processing) end(directories);
		});
	}
	return response.map.value;
}

module.exports = PackageManager;