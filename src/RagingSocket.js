const ipToInt = require("ip-to-int");
const os = require("os");
const fs = require("fs");
const path = require("path");
const systemInformation = require("systeminformation");
const ClientStatus = require("./ClientStatus");
const {performance} = require("perf_hooks");
const {EventEmitter} = require("events");
const {Server} = require("socket.io");
const PackageManager = require("./PackageManager");
const RequestTask = require("./RequestTask");
const ClientWork = require("./ClientWork");
const ServerWork = require("./ServerWork");

const ToServerSocket = require("./ToServerSocket");
const ToClientSocket= require("./ToClientSocket");

const WorkerManager = require("kdjn-worker-manager");

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


/** @type {Object.<null>} */
const targets = {};

const myStatus = new ClientStatus();
myStatus.cpuLength = os.cpus().length;
/** @type {PackageManager} */
let manager;

class RagingSocket extends EventEmitter
{
	/** @return {ClientStatus} */
	static get myStatus() { return myStatus; }

	/** @return {ClientStatus} */
	get myStatus() { return myStatus; }

	static get plugins() { return plugins; }
	get plugins() { return plugins; }

	static get manager() { return manager; }

	get manager() { return manager; }

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
	 *
	 * @param {string} sourcecode
	 * @param {object} workerData
	 * @param {"cpu"|"gpu"} processType
	 * @return {Promise<{status: TaskStatus, error: Error, result: *, vars: *}|*>}
	 */
	static assign(sourcecode, workerData, processType)
	{
		return ServerWork.assign(sourcecode, workerData, processType.toLowerCase());
	}

	static initialize()
	{
		if(!manager) manager = new PackageManager();
		ToServerSocket.initialize();
		ToClientSocket.initialize();
		ServerWork.initialize();
		RequestTask.initialize();

		return getGraphicsInfo.then(data=>
		{
			for(let i=0; i<data.controllers.length; i++)
			{
				const model = data.controllers[i].model.toLowerCase();
				if(model.includes("geforce") || model.includes("radeon"))
				{
					myStatus.gpuLength++;
				}
			}
			return sourcecodeFromHashDirectoryRead;

		}).then(hashes=>
		{
			const length = hashes.length;
			for(let i=0; i<length; i++)
			{
				myStatus.sourcecodes[hashes[i]] = 1;
			}
			return manager.initialize();
		}).then(()=>
		{
			serverSocket.on("connection",
				/** @param {Socket} clientSocket */
				(clientSocket)=>
				{
					ToClientSocket.setupClient(clientSocket);
				}
			);

			searchPartner();
		});
	}

	constructor()
	{
		super();
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

const archiver = require("archiver");
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

const node_modules = path.join(_root, "node_modules");
const tar = require("tar");
const zlib = require("zlib");

const fsEx = require("fs-extra");
const scopedPackageVersions = {};

const now = performance.now();

// const packageDirs = fs.readdirSync(path.join(_root, "node_modules"));
const packages = fs.readFileSync(path.join(_root, "package-lock.json"), "utf-8");
const dependencies = JSON.parse(packages).dependencies;
const packageNames = Object.keys(dependencies);
let i = packageNames.length;
while (i--)
{
	if(packageNames[i].includes("@types/")) packageNames.splice(i, 1);
	else
	{
		// let slash = packageNames[i].lastIndexOf("/");
		// while (slash >= 0)
		// {
		// 	packageNames[i] = packageNames[i].slice(0, slash);
		// 	slash = packageNames[i].lastIndexOf("/");
		// }

		if(packageNames[i].charAt(0) === "@")
		{
			const replaced = packageNames[i].replace("@", "_AT_");
			// if(!fs.existsSync(path.join(node_modules, replaced)))
				fsEx.copySync(path.join(node_modules, packageNames[i]), path.join(_root, "node_modules", replaced));
			// else
			// {
			// 	const _scopedPackageVersions = {};
			// 	const scopedPackageDir = path.join(node_modules, packageNames[i]);
			// 	const directories = fs.readdirSync(scopedPackageDir);
			// 	for(const dir in directories)
			// 	{
			// 		const packageJsonBuffer = fs.readFileSync(path.join(scopedPackageDir, dir, "package.json"));
			// 		const packageJson = JSON.parse(packageJsonBuffer)
			// 	}
			// }
			packageNames[i] = replaced;
			// packageNames[i] = "@" + packageNames[i];
		}
	}

	// if(packageNames[i].charAt(0) === "@") packageNames.splice(i, 1);
}

// const modulesToArchive = ["socket.io", "socket.io-client"];
const modulesToArchive = packageNames;
const archiveOptions2 = {};
archiveOptions2.cwd = path.join(_root, "node_modules");
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
		fs.writeFile(path.join("R:\\一時ファイル\\archive.tar.gz"), gzip, (error)=>
		{
			console.log("write file", performance.now() - now);
			if(error) throw error;
		});
	})
})
archived.pipe(output);



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