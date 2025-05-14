const path = require("node:path");
const fs = require("fs");
const Pathurizer = require("pathurizer");
const {promisify} = require("node:util");
const {EventEmitter} = require("events");

const emitter = new EventEmitter();

const rootCacheDir = path.join(process.cwd(), "raging-socket");
const cache_node_modules = path.join(rootCacheDir, "node_modules");
const packageCacheDir = path.join(rootCacheDir, "_packageCache");
const sourcecodeFromHashDir = path.join(rootCacheDir, "_sourcecodeFromHash");

const defaultBufferCacheDir = path.join(rootCacheDir, "_bufferCache");

const statPromise = promisify(fs.stat);
const mkdirPromise = promisify(fs.mkdir);

/** @type {typeof RagingSocket} */
let RagingSocket;

let isInitialized = false;

class Directory
{
	static get rootCacheDir() { return rootCacheDir; }
	static get cache_node_modules() { return cache_node_modules; }
	static get packageCacheDir() { return packageCacheDir; }
	static get sourcecodeFromHashDir() { return sourcecodeFromHashDir; }

	static #bufferCacheDirectory = defaultBufferCacheDir;
	static get bufferCacheDirectory()
	{
		if(this.#bufferCacheDirectory) return this.#bufferCacheDirectory;
		else return defaultBufferCacheDir;
	}

	static set bufferCacheDirectory(value)
	{
		if(!value) value = defaultBufferCacheDir;
		if(!fs.existsSync(value))
		{
			const dirPath = Pathurizer.parse(value);
			const toDirectories = dirPath.toDirectories;
			const separator = dirPath.directorySeparator;
			const directories = toDirectories.split(separator);
			const length = directories.length;
			const checkPathArray = [];
			for(let i=0; i<length; i++)
			{
				checkPathArray.push(directories[i]);
				const checkPath = checkPathArray.join(separator);
				if(!fs.existsSync(checkPath))
				{
					try
					{
						fs.mkdirSync(checkPath);
					}
					catch (error)
					{
						throw new Error("RagingSocket.options.bufferCacheDirectory に " + value + " が代入された時にディレクトリを作成しようとしましたが、" + checkPath + " にディレクトリを作成できませんでした");
					}
				}
			}
		}
		this.#bufferCacheDirectory = value;
	}

	static onInitialized(func)
	{
		isInitialized ? func() : emitter.once("initialized", func);
	}

	static initialize()
	{
		RagingSocket = require("./RagingSocket");
		return new Promise(resolve =>
		{
			const rootCacheMakeError = "プロジェクトルートに RagingSocket のキャッシュフォルダー「raging-socket」フォルダーを作成できませんでした。\n"+
				"フォルダの書き込み権限が関係している場合は、事前に「raging-socket」フォルダーを手動で作り、その中に\n"+
				"「node_modules」「_packageCache」「_sourcecodeFromHash」「_bufferCache」の４つのフォルダーを手動で作っておいてから、\n"+
				"再度サーバーを起動してください";

			const directoryMakeError = "プロジェクトルートのキャッシュフォルダー 「raging-socket」 の中に「node_modules」フォルダーを作成できませんでした。\n"+
				"フォルダの書き込み権限が関係している場合は、事前に「node_modules」「_packageCache」「_sourcecodeFromHash」「_bufferCache」の４つのフォルダーを手動で作っておいてから、\n"+
				"再度サーバーを起動してください";

			const bufferCacheMakeError = "RagingSocket.options.bufferCacheDirectory に設定されたディレクトリが存在しなかったため、ディレクトリの作成を試みましたが、エラーが発生しました";

			const checkDirectories = [cache_node_modules, packageCacheDir, sourcecodeFromHashDir];

			const length = checkDirectories.length;
			const promises = [];
			promises.push(checkDirectory(rootCacheDir, rootCacheMakeError));
			for(let i=0; i<length; i++)
			{
				promises.push(checkDirectory(checkDirectories[i], directoryMakeError));
			}
			promises.push(checkDirectory(this.bufferCacheDirectory, bufferCacheMakeError));

			Promise.all(promises).then(()=>
			{
				isInitialized = true;
				emitter.emit("initialize");
				resolve();
			});
		});
	}
}

const checkDirectory = (directory, errorMessage)=>
{
	return new Promise(resolve=>
	{
		statPromise(directory).then(()=>
		{
			resolve();
		}).catch(()=>
		{
			return mkdirPromise(directory);
		}).then(()=>
		{
			resolve();
		}).catch(()=>
		{
			throw new Error(errorMessage);
		});
	})
}

module.exports = Directory;