const ipToInt = require("ip-to-int");
const os = require("os");
const fs = require("fs");
const path = require("path");
const systemInformation = require("systeminformation");
const ClientStatus = require("./ClientStatus");
const {performance} = require("perf_hooks");
const {EventEmitter} = require("events");
const {Server} = require("socket.io");

/** @type {typeof PackageManager} */
const PackageManager = require("./PackageManager");

/** @type {typeof RequestTask} */
const RequestTask = require("./RequestTask");

/** @type {typeof ClientWork} */
const ClientWork = require("./ClientWork");

/** @type {typeof ServerWork} */
const ServerWork = require("./ServerWork");

/** @type {typeof ToServerSocket} */
const ToServerSocket = require("./ToServerSocket");

/** @type {typeof ToClientSocket} */
const ToClientSocket= require("./ToClientSocket");

/** @type {typeof WorkerManager} */
let WorkerManager;
const {Writable} = require("stream");
const zlib = require("zlib");

/** @type {Server} */
const serverSocket = new Server();

const _root = path.join(__dirname, "../");
const getGraphicsInfo = systemInformation.graphics();
/** @type {Promise<string[]>} */
const sourcecodeFromHashDirectoryRead = new Promise(resolve =>
{
	fs.readdir(path.join(_root, "sourcecodeFromHash"), (error, files)=>
	{
		if(error) throw error;
		resolve(files);
	});
});

let isInitialized = false;

const emitter = new EventEmitter();
emitter.setMaxListeners(100);


/** @type {Object.<null>} */
const targets = {};

const myStatus = new ClientStatus();
myStatus.cpuLength = os.cpus().length;
/** @type {PackageManager} */
let manager;

class RagingSocket
{
	/** @return {ClientStatus} */
	static get myStatus() { return myStatus; }

	/** @return {ClientStatus} */
	get myStatus() { return myStatus; }

	static get plugins() { return plugins; }
	get plugins() { return plugins; }

	static get manager() { return manager; }

	get manager() { return manager; }

	static options = require("./RagingSocketOptions");

	/**
	 *
	 * @param {function(cpuIdles:number[]):number} func
	 */
	static setCheckCpuIdleThresholdPlugin(func)
	{
		ClientStatus.setCheckCpuIdleThreshold(func);
	}

	static addTargetAddressRange(startAddress, endAddress=null)
	{
		startAddress = ipToInt(startAddress).toInt();
		endAddress = endAddress ? ipToInt(endAddress).toInt() : startAddress;
		if(startAddress > endAddress)
		{
			const temp = endAddress;
			endAddress = startAddress;
			startAddress = temp;
		}
		for(let i = startAddress; i<=endAddress; i++)
		{
			targets[i] = null;
		}
	}

	static addTargetAddresses(...args)
	{
		const length = args.length;
		for(let i=0; i<length; i++)
		{
			if(Array.isArray(args[i])) this.addTargetAddresses(args[i]);
			else
			{
				const ipInt = ipToInt(args[i]).toInt();
				targets[ipInt] = null;
			}
		}
	}

	static ignoreTargetAddressRange(startAddress, endAddress=null)
	{
		startAddress = ipToInt(startAddress).toInt();
		endAddress = endAddress ? ipToInt(endAddress).toInt() : startAddress;
		if(startAddress > endAddress)
		{
			const temp = endAddress;
			endAddress = startAddress;
			startAddress = temp;
		}

		for(let i = startAddress; i<=endAddress; i++)
		{
			if(typeof targets[i] !== "undefined") delete targets[i];
		}
	}

	static ignoreTargetAddresses(...args)
	{
		const length = args.length;
		for(let i=0; i<length; i++)
		{
			if(Array.isArray(args[i])) this.ignoreTargetAddresses(args[i]);
			else
			{
				const ipInt = ipToInt(args[i]).toInt();
				if(typeof targets[ipInt] !== "undefined") delete targets[ipInt];
			}
		}
	}

	/**
	 * @typedef WorkerData
	 * @property {string} jsPath
	 */

	/**
	 *
	 * @param {string} sourcecode
	 * @param {"cpu"|"gpu"} processType
	 * @param {object} [workerData=null]
	 * @return {Promise<ToClientResponse>}
	 */
	// static assign(sourcecode, processType, workerData=null)
	/**
	 *
	 * @param {WorkerData} workerData
	 * @param {"cpu"|"gpu"|"both"} processType
	 * @return {Promise<ToClientResponse>}
	 */
	static assign(workerData, processType)
	{
		if(!isInitialized)
		{
			if (!WorkerManager)
			{
				try {
					initialize();
				} catch (error) {
					throw new Error("RagingSocket.initialize メソッドが呼び出される前に RagingSocket.assign が呼び出されました。先に RagingSocket.initialize(WorkerManager) を呼び出し、WorkerManager クラスを RagingSocket へ渡してください。");
				}
			}
			return new Promise(resolve =>
			{
				emitter.on("initialized", () =>
				{
					resolve(ServerWork.assign(workerData, processType.toLowerCase()));
				});
			});
		}
		else
		{
			return ServerWork.assign(workerData, processType.toLowerCase());
		}
	}

	static initialize(WorkerManagerClass)
	{
		initialize(WorkerManagerClass);
	}

	constructor()
	{

	}
}

const initialize = (WorkerManagerClass)=>
{
	if(!manager)
	{
		if(WorkerManagerClass) WorkerManager = WorkerManagerClass;
		else
		{
			try {
				WorkerManager = require("kdjn-worker-manager");
			} catch (error) {
				throw new Error("RagingSocket.initialize() メソッドの引数に kdjn-worker-manager モジュールの WorkerManager クラスが渡されていますか？ RagingSocket を利用するには npm install kdjn-worker-manager でモジュールをインストールしておく必要があります");
			}
		}
		serverSocket.listen(require("./RagingSocketOptions").socketPort);
		manager = new PackageManager();
		ToServerSocket.initialize();
		ToClientSocket.initialize();
		ServerWork.initialize();
		RequestTask.initialize();

		const promises = [];
		promises.push(new Promise(resolve =>
		{
			getGraphicsInfo.then(data=>
			{
				for(let i=0; i<data.controllers.length; i++)
				{
					const model = data.controllers[i].model.toLowerCase();
					if(model.includes("geforce") || model.includes("radeon"))
					{
						myStatus.gpuLength++;
					}
				}
				resolve();
			});
		}))

		promises.push(new Promise(resolve =>
		{
			sourcecodeFromHashDirectoryRead.then(hashes =>
			{
				const length = hashes.length;
				for(let i=0; i<length; i++)
				{
					myStatus.sourcecodes[hashes[i]] = 1;
				}
				resolve();
			})
		}));

		promises.push(new Promise(resolve =>
		{
			manager.initialize().then(()=>
			{
				console.log("searchPartner");
				serverSocket.on("connection",
					/** @param {Socket} clientSocket */
					(clientSocket)=>
					{
						ToClientSocket.setupClient(clientSocket);
					}
				);

				searchPartner();
				resolve();
			})
		}));

		Promise.all(promises).then(()=>
		{
			isInitialized = true;
			emitter.emit("initialized");
		})
	}
}

const searchPartner=()=>
{
	for(const key in targets)
	{
		ToServerSocket.connect(ipToInt(key).toIP());
	}
}

const plugins = {};

/**
 *
 * @type {function(number[]): number}
 */
plugins.countCpuIdleThreshold = ClientStatus.countCpuIdleThreshold;

setTimeout(()=>
{
	console.log("end!!!!");
}, 1000 * 60 * 60 * 24);

if(0)
{
	const archiveOptions = {};
	archiveOptions.gzip = true;
	archiveOptions.gzipOptions = {};
	archiveOptions.gzipOptions.memLevel = 9;
	archiveOptions.gzipOptions.strategy = 3;
	archiveOptions.gzipOptions.windowBits = 15;
	archiveOptions.statConcurrency = 1;
	const {Writable} = require("stream");

	class CustomWriteStream extends Writable
	{
		constructor() {
			super();
			this.buffers = [];
		}
		_write(chunk, encoding, callback) {
			this.buffers.push(chunk);
			callback();
		}
	}

	const node_modules = path.join(process.cwd(), "node_modules");
	const tar = require("tar");
	const zlib = require("zlib");

	const fsEx = require("fs-extra");
	const scopedPackageVersions = {};

	const now = performance.now();

// const packageDirs = fs.readdirSync(path.join(_root, "node_modules"));
	const packageLockJsonText = fs.readFileSync(path.join(process.cwd(), "package-lock.json"), "utf-8");
	const packageLockJsonObj = JSON.parse(packageLockJsonText);
	if(typeof packageLockJsonObj.dependencies !== "undefined")
	{
		const packageNames = Object.keys(packageLockJsonObj);
		let i = packageNames.length;
		while (i--)
		{
			if(packageNames[i].includes("@types/")) packageNames.splice(i, 1);
			else
			{
				if(packageNames[i].charAt(0) === "@")
				{
					const replaced = packageNames[i].replace("@", "_AT_");
					fsEx.copySync(path.join(node_modules, packageNames[i]), path.join(node_modules, replaced));

					packageNames[i] = replaced;
				}
				else if(packageNames[i] === "fsevents")
				{
					packageNames.splice(i, 1);
				}
			}

			// if(packageNames[i].charAt(0) === "@") packageNames.splice(i, 1);
		}
	}
	else if(packageLockJsonObj.packages)
	{

	}


//  const modulesToArchive = ["socket.io", "socket.io-client"];
	const modulesToArchive = packageNames;
	const archiveOptions2 = {};
	archiveOptions2.cwd = path.join(process.cwd(), "node_modules");
	archiveOptions2.sync = true;

	const archived = tar.c(archiveOptions2, modulesToArchive);
	const output = new CustomWriteStream();
	output.on("close", ()=>
	{
		console.log("close", performance.now() - now);
	});
	output.on("finish", ()=>
	{
		console.log("finish", performance.now() - now);
		const buffer = Buffer.concat(output.buffers);
		zlib.gzip(buffer, (error, gzip)=>
		{
			console.log("gzipped", performance.now() - now);
			fs.writeFile(path.join("R:\\Downloads\\archive.tar.gz"), gzip, (error)=>
			{
				console.log("write file", performance.now() - now);
				const dir = "R:\\Downloads";
				zlib.gunzip(gzip, (error, buffer)=>
				{
					if(error) throw error;

					const extractor = tar.extract({cwd: dir, onentry: entry =>
						{
							entry.path = entry.path.replace("_AT_", "@");
							if(entry.path.slice(-1) === "/")
							{
								console.log(entry.path.slice(0, -1));
							}
							// console.log(entry);
						}});

					extractor.on("error", error =>
					{
						console.error(error);
					});
					extractor.on("end", ()=>
					{
						console.log("extract", performance.now() - now);
						/*
						fs.readdir(dir, (error, directories)=>
						{
							for(const i in directories)
							{
								const directoryName = directories[i];
								if(directoryName.slice(0,4) === "_AT_")
								{
									const newName = directoryName.replace("_AT_", "@");
									fs.rename(path.join(dir, directoryName), path.join(dir, newName), ()=>
									{
										console.log("renamed " + newName, performance.now() - now);
									})
								}
							}
						})
						 */
					});

					extractor.end(buffer);

				})

				/*
				const gzipStream = fs.createReadStream("R:\\Downloads\\archive.tar.gz").pipe(zlib.createGunzip());

				const tarExtractor = tar.extract({cwd: dir});
				const extractor = gzipStream.pipe(tarExtractor);
				extractor.on("error", error =>
				{
					console.error(error);
				});
				extractor.on("end", ()=>
				{
					console.log("extract", performance.now() - now);
					fs.readdir(dir, (error, directories)=>
					{
						for(const i in directories)
						{
							const directoryName = directories[i];
							if(directoryName.slice(0,4) === "_AT_")
							{
								const newName = directoryName.replace("_AT_", "@");
								fs.rename(path.join(dir, directoryName), path.join(dir, newName), ()=>
								{
									console.log("renamed " + newName, performance.now() - now);
								})
							}
						}
					})
				});

				if(error) throw error;
				 */
			});
		})
	})
// archived.pipe(output);
}





/*
const archive = archiver.create("tar", archiveOptions);
const output = new CustomWriteStream();
output.on("close", ()=>
{
	console.log("close", performance.now() - now);
});
output.on("finish", (result)=>
{
	console.log("finish", performance.now() - now);
	fs.writeFile(path.join("R:\\一時ファイル\\archive.tar.gz"), Buffer.concat(output.buffers), (error)=>
	{
		if(error) throw error;
	});
})

archive.pipe(output);
archive.directory(path.join(_root, "/node_modules/socket.io"), "socket.io");
archive.directory(path.join(_root, "/node_modules/socket.io-client"), "socket.io-client");

archive.finalize().then(()=>
{

}).catch(reason=>
{
	console.log(reason);
});
 */

module.exports = RagingSocket;