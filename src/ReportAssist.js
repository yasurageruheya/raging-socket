const SocketMessage = require("./SocketMessage");
const logOptions = require("./RagingSocketOptions").logOptions;

/** @type {typeof RequestTask} */
let RequestTask;

/** @type {Map<SocketEmitter, ReportAssist>} */
const instances = new Map();

/** @type {Object.<RequestTask[]>} */
const packageBufferAwaiter = {};

/** @type {Object.<RequestTask[]>} */
const sourcecodeAwaiter = {};

module.exports = class ReportAssist
{
	static initialize()
	{
		RequestTask = require("./RequestTask");
	}

	/**
	 *
	 * @param socketEmitter
	 * @returns {ReportAssist}
	 */
	static get(socketEmitter)
	{
		if(!instances.has(socketEmitter))
			instances.set(socketEmitter, new ReportAssist(socketEmitter));

		return instances.get(socketEmitter);
	}

	/**
	 *
	 * @param {SocketEmitter} socketEmitter
	 */
	constructor(socketEmitter)
	{
		/** @type {SocketEmitter} */
		this.socketEmitter = socketEmitter;

		/** @type {PackageManager} */
		this.packageManager = socketEmitter.packageManager;
	}

	logs = [];

	logOutputStatusReport(status, ipAddress)
	{
		const idles = [];
		let length = status.cpuIdles.length;
		for(let i=0; i<length; i++)
		{
			const str = (((status.cpuIdles[i] * 1000) >> 0) * .1) + ".0";
			idles[i] = str.slice(0, str.indexOf(".") + 2) + "%";
		}
		const runningCpuProcess = status.runningCpuProcesses.concat();
		const runningGpuProcess = status.runningGpuProcesses.concat();
		length = runningCpuProcess.length;
		for(let i=0; i<length; i++)
		{
			runningCpuProcess[i] = RequestTask.getTaskNameFromTaskId(runningCpuProcess[i]);
		}
		length = runningGpuProcess.length;
		for(let i=0; i<length; i++)
		{
			runningGpuProcess[i] = RequestTask.getTaskNameFromTaskId(runningGpuProcess[i]);
		}
		console.log("client status report:", ipAddress, idles, ", idleCpuLength:", status.idleCpuLength, ", idleGpuLength:", status.idleGpuLength, "runningCpuProcesses:", runningCpuProcess, "runningGpuProcesses:", runningGpuProcess);
	}

	unacceptableTask(report, request, reason)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["サーバーからのタスク受入不可:", taskName(request), this.socketEmitter.ipAddress, "理由:", SocketMessage.fromValue(reason)].join());

		report.status = SocketMessage.C2S_UNACCEPTABLE_TASK;
		report.reason = reason;
	}

	taskRejected(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["クライアントからタスク受入拒否:", taskName(request), this.socketEmitter.ipAddress, "理由:", SocketMessage.fromValue(report.reason)].join());

		request.assignCancel();
		request.pullOut();
	}

	requestSourcecode(report, request)
	{
		if(typeof sourcecodeAwaiter[request.sourcecodeHash] === "undefined")
		{
			sourcecodeAwaiter[request.sourcecodeHash] = [];
			report.status = SocketMessage.C2S_REQUEST_SOURCECODE;
			report.sourcecodeHash = request.sourcecodeHash;

			if(logOptions.taskTraceLevel > 2)
				this.logs.push(["サーバーにソースコード要求:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash, "=>", this.socketEmitter.ipAddress].join());
		}
		else
		{
			report.status = "";
			if(logOptions.taskTraceLevel > 2)
				this.logs.push(["他タスクがサーバーにソースコードを要求中なので待機:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash].join());
		}

		sourcecodeAwaiter[request.sourcecodeHash].push(request);
	}

	requestPackageBuffer(report, request, shortfallPackageHash)
	{
		if(typeof packageBufferAwaiter[shortfallPackageHash] === "undefined")
		{
			packageBufferAwaiter[shortfallPackageHash] = [];
			report.status = SocketMessage.C2S_REQUEST_PACKAGE_BUFFER_FROM_PACKAGE_HASH;
			report.shortfallPackageHash = shortfallPackageHash;

			if(logOptions.taskTraceLevel > 2)
				this.logs.push(["サーバーに不足パッケージを要求:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash, "不足パッケージハッシュ", shortfallPackageHash, "=>", this.socketEmitter.ipAddress].join());
		}
		else
		{
			report.status = "";
			if(logOptions.taskTraceLevel > 2)
				this.logs.push(["他タスクがサーバーに不足パッケージを要求中なので待機:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash, "不足パッケージハッシュ", shortfallPackageHash].join());
		}

		packageBufferAwaiter[shortfallPackageHash].push(request);
	}

	packageBufferRequested(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["クライアントから不足パッケージの要求:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash, "不足パッケージハッシュ", report.shortfallPackageHash, "=>", this.socketEmitter.ipAddress].join());

		return new Promise(resolve =>
		{
			this.packageManager.getPackageBufferFromPackageHash(report.shortfallPackageHash).then((buffer)=>
			{
				if(buffer)
					this.responsePackageBuffer(report, request, buffer);
				else
					this.requestShortfallPackages(report, request);

				resolve();
			})
		});
	}

	responsePackageBuffer(report, request, buffer)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["クライアントに不足パッケージの圧縮データを送信:", taskName(request), this.socketEmitter.ipAddress, "パッケージハッシュ:", report.shortfallPackageHash].join());

		report.status = SocketMessage.S2C_RESPONSE_PACKAGE_BUFFER;
		report.buffer = buffer;
	}

	receivePackageBuffer(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["サーバーから不足パッケージの圧縮データを受信:", taskName(request), this.socketEmitter.ipAddress, "パッケージハッシュ:", report.shortfallPackageHash].join());

		const promise = this.packageManager.setPackageBuffer(report.shortfallPackageHash, report.buffer);
		const awaiter = packageBufferAwaiter[report.shortfallPackageHash];
		const length = awaiter.length;
		const reports = {};
		for(let i=0; i<length; i++)
		{
			const request = awaiter[i];
			const report = {taskId: request.taskId};
			reports[request.taskId] = report;
			this.confirmTask(report, request);
		}
		delete packageBufferAwaiter[report.shortfallPackageHash];
		return {promise, reports};
	}

	requestShortfallPackages(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["クライアントに不足分パッケージ詳細を要求:", taskName(request), this.socketEmitter.ipAddress, "パッケージハッシュ:", report.shortfallPackageHash].join());

		report.status = SocketMessage.S2C_REQUEST_PACKAGES_FROM_PACKAGE_HASH;
	}

	responseShortfallPackages(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["サーバーに不足パッケージの詳細を返信:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash, "不足パッケージハッシュ", report.shortfallPackageHash, "=>", this.socketEmitter.ipAddress].join());

		report.status = SocketMessage.C2S_RESPONSE_PACKAGES_FROM_PACKAGE_HASH;
		report.shortfallPackages = this.packageManager.getPackagesFromPackageHash(report.shortfallPackageHash);
	}

	receiveShortfallPackages(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["クライアントから不足パッケージの詳細を受信:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash, "不足パッケージハッシュ", report.shortfallPackageHash, "=>", this.socketEmitter.ipAddress].join());

		return new Promise(resolve =>
		{
			this.packageManager.getPackageBufferFromPackages(report.shortfallPackages, report.shortfallPackageHash).then((buffer)=>
			{
				delete report.shortfallPackages;
				this.responsePackageBuffer(report, request, buffer);
				resolve();
			});
		});
	}

	responseSourcecode(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["クライアントに送信するソースコードを準備:", taskName(request), this.socketEmitter.ipAddress, report.sourcecodeHash].join());

		return new Promise(resolve =>
		{
			report.status = SocketMessage.S2C_RESPONSE_SOURCECODE;
			report.requiredPackages = request.requiredPackages;
			this.packageManager.getSourcecodeFromSourcecodeHash(report.sourcecodeHash).then(sourcecode=>
			{
				if(logOptions.taskTraceLevel > 2)
					this.logs.push(["クライアントにソースコードを送信:", taskName(request), this.socketEmitter.ipAddress, report.sourcecodeHash].join());

				report.sourcecode = sourcecode;
				resolve();
			})
		});
	}

	receiveSourcecode(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["サーバーからソースコードを受信:", taskName(request), this.socketEmitter.ipAddress, report.sourcecodeHash].join());

		this.packageManager.setSourcecodeFromSourcecodeHash(report.sourcecodeHash, report.sourcecode);

		const shortfallPackageHash = this.packageManager.getShortfallPackageHashFromPackages(report.requiredPackages);
		delete report.requiredPackages;
		const awaiter = sourcecodeAwaiter[report.sourcecodeHash];
		if(!awaiter)
			console.log(report.sourcecodeHash);
		let i = awaiter.length;
		const reports = {};
		while (i--)
		{
			const request = awaiter[i];
			const report = {taskId: request.taskId};
			if(shortfallPackageHash)
				this.requestPackageBuffer(report, request, shortfallPackageHash);
			else
				this.confirmTask(report, request);

			reports[request.taskId] = report;
		}

		delete sourcecodeAwaiter[report.sourcecodeHash];
		return reports;
	}

	confirmTask(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["サーバーにタスク承諾を送信:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash, "=>", this.socketEmitter.ipAddress].join());

		report.status = SocketMessage.C2S_CONFIRM_TASKS;
	}

	/**
	 *
	 * @param report
	 * @param {RequestTask} request
	 */
	sendWorkerData(report, request)
	{
		if(logOptions.taskTraceLevel > 2)
			this.logs.push(["クライアントからタスク承諾を受信:", taskName(request), "ソースコードハッシュ:", request.sourcecodeHash, "=>", this.socketEmitter.ipAddress].join());

		report.status = SocketMessage.S2C_SEND_WORKER_DATA;
		report.sourcecodeHash = request.sourcecodeHash;
		report.workerData = request.workerData;
		request.pullOut();
	}

	logOutput()
	{
		if(this.logs.length)
		{
			console.log(this.logs.join("\n") + "\n" + new Error().stack.split("\n").slice(2).join("\n"));
			this.logs.length = 0;
		}
	}
}

const taskName = (request)=>
{
	return RequestTask.getTaskNameFromTaskId(request.taskId);
}