const ipToInt = require("ip-to-int");
const os = require("os");
const fs = require("fs");
const path = require("path");
const systemInformation = require("systeminformation");
const ClientStatus = require("./ClientStatus");
const {performance} = require("perf_hooks");
const {Server} = require("socket.io");

/** @type {typeof PackageManager} */
let PackageManager;

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
const {create, Pack} = require("tar");

/** @type {Server} */
const serverSocket = new Server();

const getGraphicsInfo = systemInformation.graphics();

let isInitialized = false;

/** @type {Object.<null>} */
const targets = {};

const myStatus = new ClientStatus();
myStatus.cpuLength = os.cpus().length;
/** @type {PackageManager} */
let packageManager;

const rootCacheDir = require("./Directory").rootCacheDir;

class RagingSocket
{
	/** @return {ClientStatus} */
	static get myStatus() { return myStatus; }

	static get packageManager() { return packageManager; }

	static get workerManager() { return WorkerManager; }

	static options = require("./RagingSocketOptions");

	static get rootCacheDir() { return rootCacheDir; }

	/**
	 *
	 * @param {function(cpuIdles:number[]):number} func
	 */
	static setCheckCpuIdleThreshold(func)
	{
		ClientStatus.setCheckCpuIdleThreshold(func);
	}

	static addTargetAddressRange(startAddress, endAddress=null)
	{
		const {start, end} = createAddressNumber(startAddress, endAddress);

		for(let i = start; i<=end; i++)
		{
			targets[i] = null;
		}
	}

	static addAcceptsAddressRange(startAddress, endAddress=null)
	{
		const {start, end} = createAddressNumber(startAddress, endAddress);

		for(let i = start; i<=end; i++)
		{
			ToServerSocket.accepts[i] = null;
		}
	}

	static addTargetAddresses(...args)
	{
		addAddresses(targets, ...args);
	}

	static addAcceptsAddresses(...args)
	{
		addAddresses(ToServerSocket.accepts, ...args);
	}

	static ignoreTargetAddressRange(startAddress, endAddress=null)
	{
		const {start, end} = createAddressNumber(startAddress, endAddress);

		for(let i = start; i<=end; i++)
		{
			if(typeof targets[i] !== "undefined") delete targets[i];
		}
	}

	static ignoreAcceptsAddressRange(startAddress, endAddress=null)
	{
		const {start, end} = createAddressNumber(startAddress, endAddress);
		const accepts = ToServerSocket.accepts;

		for(let i = start; i<=end; i++)
		{
			if(typeof accepts[i] !== "undefined") delete accepts[i];
		}
	}

	static ignoreTargetAddresses(...args)
	{
		ignoreAddresses(targets, ...args);
	}

	static ignoreAcceptsAddresses(...args)
	{
		ignoreAddresses(ToServerSocket.accepts, ...args);
	}

	static get accepts()
	{
		return Object.keys(ToServerSocket.accepts);
	}

	/**
	 * @typedef WorkerData
	 * @property {string} jsPath
	 */

	/**
	 *
	 * @param {WorkerData} workerData
	 * @param {"cpu"|"gpu"|"both"} processType
	 * @param {string} taskName 割り当てたタスクを追跡したい場合に、タスクに名前を付けてください。 FromClientProcessing インスタンスや、ToClientResponse インスタンス にはユニークな taskId プロパティが割り当てられていますが、任意に命名したタスク名（taskName）で追跡したり、ログに表示される際に taskId ではなくタスク名(taskName)で表示されるようになります。
	 * @return {Promise<ToClientResponse>}
	 */
	static assign(workerData, processType, taskName="")
	{
		if(!isInitialized)
		{
			return new Promise(resolve=>
			{
				initialize().then(()=>
				{
					resolve(ServerWork.assign(workerData, processType.toLowerCase(), taskName));
				}).catch(()=>
				{
					throw new Error("RagingSocket.initialize メソッドが呼び出される前に RagingSocket.assign が呼び出されました。先に RagingSocket.initialize(require('kdjn-worker-manager')) を呼び出して、WorkerManager クラスを RagingSocket へ渡した後、戻り値の Promise インスタンスの完了を待ってから、assign メソッドを使うようにしてください");
				});
			});
		}
		else
		{
			return ServerWork.assign(workerData, processType.toLowerCase(), taskName);
		}
	}

	/**
	 *
	 * @param {typeof WorkerManager} WorkerManagerClass
	 * @returns {Promise<void>}
	 */
	static initialize(WorkerManagerClass)
	{
		return initialize(WorkerManagerClass);
	}

	constructor()
	{

	}
}

const createAddressNumber = (startAddress, endAddress)=>
{
	startAddress = ipToInt(startAddress).toInt();
	endAddress = endAddress ? ipToInt(endAddress).toInt() : startAddress;
	if(startAddress > endAddress)
	{
		const temp = endAddress;
		endAddress = startAddress;
		startAddress = temp;
	}
	return {startAddress, endAddress};
}

const addAddresses = (object, ...args)=>
{
	const length = args.length;
	for(let i=0; i<length; i++)
	{
		if(Array.isArray(args[i])) addAddresses(object, args[i]);
		else
		{
			const ipInt = ipToInt(args[i]).toInt();
			object[ipInt] = null;
		}
	}
}

const ignoreAddresses = (object, ...args)=>
{
	const length = args.length;
	for(let i=0; i<length; i++)
	{
		if(Array.isArray(args[i])) ignoreAddresses(object, args[i]);
		else
		{
			const ipInt = ipToInt(args[i]).toInt();
			if(typeof object[ipInt] !== "undefined") delete object[ipInt];
		}
	}
}

/** @type {Promise<void>|void} */
let initializePromise;

const initialize = (WorkerManagerClass)=>
{
	if(!initializePromise)
	{
		initializePromise = new Promise((resolve, reject) =>
		{
			if(!packageManager)
			{
				if(WorkerManagerClass)
					WorkerManager = WorkerManagerClass;
				else
					reject("RagingSocket.initialize() メソッドの引数に kdjn-worker-manager モジュールの WorkerManager クラスが渡されていますか？ RagingSocket を利用するには npm install kdjn-worker-manager でモジュールをインストールしておく必要があります");

				const RagingSocketOptions = require("./RagingSocketOptions");
				RagingSocketOptions.initialize();
				//todo: targetAddress が無くても listen した方が良いのか？？ しない方が良いのか？？
				serverSocket.listen(RagingSocketOptions.socketPort);
				PackageManager = require("./PackageManager");
				packageManager = new PackageManager();
				ToServerSocket.initialize();
				ToClientSocket.initialize();
				ServerWork.initialize();
				require("./RequestTask").initialize();
				require("./ToClientResponse").initialize();
				require("./ReportAssist").initialize();
				require("./ClientWork").initialize();

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
				}));

				// promises.push(Directory.initialize());

				promises.push(new Promise(resolve =>
				{
					packageManager.initialize().then(()=>
					{
						searchPartner();
						resolve();
					})
				}));

				Promise.all(promises).then(()=>
				{
					isInitialized = true;
					resolve();
				})
			}
			else resolve();
		});
	}
	return initializePromise;
}

const searchPartner = ()=>
{
	if(Object.keys(targets).length)
	{
		serverSocket.on("connection",
			/** @param {Socket} clientSocket */
			(clientSocket)=>
			{
				//todo: clientSocket が TargetAddress として指定された物と一致する IP アドレスかどうかのチェックが必要だと思う！！！
				ToClientSocket.setupClient(clientSocket);
			}
		);
	}

	const accepts = ToServerSocket.accepts;
	for(const key in accepts)
	{
		ToServerSocket.connect(ipToInt(key).toIP());
	}
}

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