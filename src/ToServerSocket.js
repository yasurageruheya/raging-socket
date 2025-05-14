const {io} = require("socket.io-client");
const cpuIdleCheck = require("./cpuIdleCheck");
const SocketMessage = require("./SocketMessage");
const RagingSocketError = require("./RagingSocketError");
const {createHash} = require("crypto");
const Decimalian = require("decimalian");
const ipToInt = require("ip-to-int");

/** @type {TimeLimitedFileCache} */
let timeLimitedBufferCache;

/** @type {Object.<ToServerSocket>} */
const instances = {};

/** @type {typeof RagingSocket} */
let RagingSocket;

/** @type {typeof ClientWork} */
let ClientWork;

/** @type {typeof RequestTask} */
let RequestTask;

/** @type {typeof ReportAssist} */
let ReportAssist;

/** @type {Object.<WorkerMain>} */
const assignedWorker = {};

/** @type {Object.<RequestTask>} */
const receivedRequests = {};

/** Object.<Array.<taskId:string, dataName:string>> */
const receivingBufferHash = {};


const SocketEmitter = require("./SocketEmitter");

/** @type {Object.<null>} */
const accepts = {};

/** @type {PackageManager} */
let packageManager;

class ToServerSocket extends SocketEmitter
{
	static get accepts() { return accepts; }

	static connect(ipAddress)
	{
		if(typeof instances[ipAddress] === "undefined") instances[ipAddress] = new ToServerSocket(ipAddress);
		return instances[ipAddress];
	}

	static initialize()
	{
		ClientWork = require("./ClientWork");
		RequestTask = require("./RequestTask");
		ReportAssist = require("./ReportAssist");
		RagingSocket = require("./RagingSocket");
		packageManager = RagingSocket.packageManager;

		const TimeLimitedFileCache = require("time-limited-file-cache");
		timeLimitedBufferCache = TimeLimitedFileCache.fromDirectory(RagingSocket.options.bufferCacheDirectory, RagingSocket.options.bufferCacheMemoryTTL, RagingSocket.options.bufferCacheFileTTL);
	}

	/** @type {ReportAssist} */
	reportAssist;

	/** @type {import("socket.io-client").Socket} */
	socket;


	hasSendStatusQueue = false;

	/** @type {NodeJS.Timeout|number} */
	sendStatusCooldown;

	constructor(ipAddress)
	{
		super(ipAddress, packageManager);

		const options = RagingSocket.options;
		this.reportAssist = ReportAssist.get(this);

		setup(ipAddress, this, io("ws://" + ipAddress + ":" + options.socketPort, options.toServerSocketOptions));
	}
}

/**
 *
 * @param {string} ipAddress
 * @param {ToServerSocket} toServerSocket
 * @param {import("socket.io-client").Socket} socket
 */
const setup = (ipAddress, toServerSocket, socket)=>
{
	//todo: 中の処理がまだ作りかけかもしれないので、もう一回ちゃんと読む！！！！！
	const options = RagingSocket.options;
	const logOptions = options.logOptions;

	toServerSocket.socket = socket;

	const reconnectChallenge = ()=>
	{
		console.log("サーバーからの応答が無いため、再接続を試行");
		toServerSocket.socket.off();
		toServerSocket.socket.close();
		toServerSocket.socket.disconnect();
		toServerSocket.off();
		setup(ipAddress, toServerSocket, io("ws://" + ipAddress + ":" + options.socketPort, options.toServerSocketOptions));
	}
	let reconnectChallengeTimeout = setTimeout(reconnectChallenge, 5000);

	socket.io.on("reconnect_failed", ()=>
	{
		console.log("socket.io reconnect_failed");
		toServerSocket.off();
		socket.io.off();
		delete instances[ipAddress];
	});

	socket.on("connect", ()=>
	{
		toServerSocket.emit(SocketMessage.C2S_CONNECT_SUCCESS);
		console.log("サーバー", socket.io.opts.hostname, "と接続開始");
	});

	socket.on("disconnect", ()=>
	{
		console.log("サーバー", socket.io.opts.hostname, "との接続が中断されました");
	});

	toServerSocket.on(SocketMessage.S2C_CONNECT_SUCCESS, () =>
	{
		clearTimeout(reconnectChallengeTimeout);
		console.log("サーバー", socket.io.opts.hostname, "との相互接続確認完了");
		sendMyStatus(toServerSocket);
	});

	toServerSocket.on(SocketMessage.S2C_CLAIM_STATUS, ()=>
	{
		if(typeof accepts[ipToInt(ipAddress).toInt()] !== "undefined")
			sendMyStatus(toServerSocket);
		else
			console.log("許可されていない IP アドレスからステータス要求が送られてきたため、要求に応答しませんでした:", ipAddress);
	});

	toServerSocket.on(SocketMessage.S2C_REQUEST_TASKS,
		/** @param {RequestTask[]} requests */
		(requests)=>
		{
			const reports = {};
			if(!requests)
				console.log(requests);
			const length = requests.length;
			const myStatus = RagingSocket.myStatus;

			myStatus.cpuIdleThresholdCounted = false;
			myStatus.cpuIdles = cpuIdleCheck();

			const reportAssist = toServerSocket.reportAssist;

			const promises = [];
			for(let i=0; i<length; i++)
			{
				const request = requests[i];
				const taskId = request.taskId;
				if(request.taskName) RequestTask.setTaskNameFromTaskId(taskId, request.taskName);

				const report = {taskId: taskId};
				reports[taskId] = report;
				if(request.assignedProcessType === "cpu" && myStatus.idleCpuLength <= 0)
				{
					reportAssist.unacceptableTask(report, request, SocketMessage.CPU_LIMIT);
					continue;
				}
				else if(request.assignedProcessType === "gpu" && myStatus.idleGpuLength <= 0)
				{
					reportAssist.unacceptableTask(report, request, SocketMessage.GPU_LIMIT);
					continue;
				}

				receivedRequests[taskId] = request;

				if(request.processType === "cpu") myStatus.runningCpuProcesses.push(taskId);
				else myStatus.runningGpuProcesses.push(taskId);

				// console.log("client runningCpuProcesses+:", RagingSocket.myStatus.runningCpuProcesses)

				promises.push(packageManager.getSourcecodeFromSourcecodeHash(request.sourcecodeHash).then(sourcecode=>
				{
					if(!sourcecode)
						reportAssist.requestSourcecode(report, request);
					else
					{
						const shortfallPackageHash = packageManager.getShortfallPackageHashFromPackages(request.requiredPackages);
						if(shortfallPackageHash)
							reportAssist.requestPackageBuffer(report, request, shortfallPackageHash);
						else
							reportAssist.confirmTask(report, request);
					}
				}));
			}
			reportAssist.logOutput();

			Promise.all(promises).then(()=>
			{
				reportAssist.logOutput();
				toServerSocket.emit(SocketMessage.C2S_REPORT_TASKS_STATUS, reports);
			});
		});

	toServerSocket.on(SocketMessage.S2C_TASK_SUPPLEMENTATION,
		/** @param {object[]|any} reports */
		(reports)=>
		{
			const promises = [];
			const reportAssist = toServerSocket.reportAssist;
			for(const taskId in reports)
			{
				const report = reports[taskId];
				const request = receivedRequests[taskId];
				switch (report.status)
				{
					case SocketMessage.S2C_RESPONSE_SOURCECODE:
						const awaiter = reportAssist.receiveSourcecode(report, request);
						for(const taskId in awaiter)
						{
							reports[taskId] = awaiter[taskId];
						}
						break;
					case SocketMessage.S2C_REQUEST_PACKAGES_FROM_PACKAGE_HASH:
						reportAssist.responseShortfallPackages(report, request);
						break;
					case SocketMessage.S2C_RESPONSE_PACKAGE_BUFFER:
						const result = reportAssist.receivePackageBuffer(report, request);
						promises.push(result.promise);
						for(const taskId in result.reports)
						{
							reports[taskId] = result.reports[taskId];
						}
						break;
					case SocketMessage.S2C_SEND_WORKER_DATA:
						ClientWork.assignWorker(report).then(
							/** @param {WorkerMain} workerMain */
							(workerMain)=>
							{
								assignedWorker[taskId] = workerMain;
								toServerSocket.emit(SocketMessage.C2S_WORKER_READY, {taskId: report.taskId});

							}).catch(error =>
						{
							if(logOptions.taskTraceLevel > 0)
								console.log("タスク開始前エラー:", RequestTask.getTaskNameFromTaskId(taskId), error);

							/** @type {any} */
							const report = {taskId, error};
							toServerSocket.emit(SocketMessage.C2S_TASK_PREPROCESS_ERROR, report);
						});
						delete reports[taskId];
						break;
				}
			}

			reportAssist.logOutput();

			Promise.all(promises).then(()=>
			{
				reportAssist.logOutput();
				if(Object.keys(reports).length)
					toServerSocket.emit(SocketMessage.C2S_REPORT_TASKS_STATUS, reports);
			});
		});

	toServerSocket.on(SocketMessage.S2C_RECEIVE_RESULT, ()=>
	{
		sendMyStatus(toServerSocket);
	});

	toServerSocket.on(SocketMessage.S2C_TASK_CANCEL, (taskId) =>
	{
		removeRequest(taskId);
		sendMyStatus(toServerSocket);
	});

	toServerSocket.on(SocketMessage.S2C_SEND_TRANSFER_DATA, (taskId, data, dataName)=>
	{
		if(!data) console.log("!!!!data is undefined!!!!");
		// 転送量が1MB未満の場合、data が ひとまとまりで来て、1MB 以上の場合は SocketMessage.S2C_SEND_SPLIT_BUFFER_DATA で小分けにされて送られて来る
		assignedWorker[taskId].sendToSubWorker.transfer(data, dataName, false, ()=>
		{
			toServerSocket.emit(SocketMessage.C2S_RECEIVED_TRANSFER_DATA, dataName);
		});
	});

	toServerSocket.on(SocketMessage.S2C_SEND_SPLIT_BUFFER_DATA, (taskId, bufferHash, dataName)=>
	{
		if(timeLimitedBufferCache)
		{
			timeLimitedBufferCache.read(bufferHash).then(data=>
			{
				if(!data) claimSplitBufferData(toServerSocket, bufferHash, taskId, dataName);
				else
				{
					assignedWorker[taskId].sendToSubWorker.transfer(data, dataName, false, ()=>
					{
						if(!data) console.log("!!!!data is undefined!!!!");
						toServerSocket.emit(SocketMessage.C2S_RECEIVED_ALL_SPLIT_BUFFER_DATA, bufferHash);
					});
				}
			})
		}
		else
		{
			claimSplitBufferData(toServerSocket, bufferHash, taskId, dataName);
		}
	});

	toServerSocket.on(SocketMessage.S2C_SEND_VARS, (taskId, data)=>
	{
		assignedWorker[taskId].sendToSubWorker.vars(data, ()=>
		{
			toServerSocket.emit(SocketMessage.C2S_RECEIVED_VARS);
		});
	});

	toServerSocket.on(SocketMessage.S2C_TASK_START, (taskId)=>
	{
		const logOptions = RagingSocket.options.logOptions;
		if(logOptions.taskTraceLevel > 2)
			console.log("サーバーからのタスク開始要求:", RequestTask.getTaskNameFromTaskId(taskId));

		const workerMain = assignedWorker[taskId];
		/** @type {any} */
		const report = {taskId: taskId};
		workerMain.once("end", result =>
		{
			if(result instanceof ArrayBuffer)
			{
				const sendBufferHexHash = createHash("sha256").update(Buffer.from(result)).digest("hex");
				const sendBufferHash = Decimalian.fromString(sendBufferHexHash, 16).toString();
				report.result = sendBufferHash;

				timeLimitedBufferCache.write(sendBufferHash, result);

				if(logOptions.taskTraceLevel > 1)
					console.log("サーバーへタスク完了後の大容量データを送信:", RequestTask.getTaskNameFromTaskId(taskId));

				toServerSocket.emit(SocketMessage.C2S_TASK_COMPLETE_AND_AFTER_SEND_BUFFER, report);
			}
			else
			{
				if(logOptions.taskTraceLevel > 1)
					console.log("サーバーへタスク完了を送信:", RequestTask.getTaskNameFromTaskId(taskId));

				report.result = result;
				toServerSocket.emit(SocketMessage.C2S_TASK_COMPLETE, report);
			}
			removeRequest(taskId);
		});

		workerMain.on("error", error =>
		{
			if(logOptions.taskTraceLevel > 0)
				console.log("タスクエラー:", RequestTask.getTaskNameFromTaskId(taskId), error);

			report.error = error;
			toServerSocket.emit(SocketMessage.C2S_TASK_PROCESSING_ERROR, report);
		});

		workerMain.on("vars", vars =>
		{
			if(logOptions.taskTraceLevel > 2)
				console.log("タスクスレッドから変数を受信:", RequestTask.getTaskNameFromTaskId(taskId));

			report.vars = vars;
			toServerSocket.emit(SocketMessage.C2S_TASK_PROCESSING, report);
		});

		workerMain.start(()=>
		{
			if(logOptions.taskTraceLevel > 0)
				console.log("タスク開始:", RequestTask.getTaskNameFromTaskId(taskId));

			toServerSocket.emit(SocketMessage.C2S_TASK_STARTED, taskId);
		});
	});

	toServerSocket.on(SocketMessage.S2C_CLAIM_RESULT_BUFFER, (bufferHash)=>
	{
		const segments = [];
		new Promise(resolve=>
		{
			timeLimitedBufferCache.read(bufferHash).then(arrayBuffer=> resolve(arrayBuffer));

		}).then(/** @param {ArrayBuffer|undefined} sendBuffer */sendBuffer=>
		{
			if(!sendBuffer)
				throw RagingSocketError.getTimeLimitedFileCacheTTLError(bufferHash);

			const byteLength = Buffer.byteLength(sendBuffer);
			if(RagingSocket.options.logOptions.bufferHashCheck)
			{
				const fullBufferHash = Decimalian.fromString(createHash("sha256").update(Buffer.from(sendBuffer)).digest("hex"), 16).toString();
				console.log("scheduled to send full buffer hash:", fullBufferHash, ", byteLength:", Buffer.byteLength(sendBuffer), ", original buffer hash:", bufferHash);
			}
			for(let i=0; i<byteLength; i += 1_000_000)
			{
				const fragmentBuffer = sendBuffer.slice(i, i + 1_000_000);
				segments.push(fragmentBuffer);

				if(RagingSocket.options.logOptions.bufferHashCheck)
				{
					const fragmentBufferHash = Decimalian.fromString(createHash("sha256").update(new Uint8Array(fragmentBuffer)).digest("hex"), 16).toString();
					console.log("scheduled to send full buffer hash:", bufferHash, ", fragment buffer hash:", fragmentBufferHash, ", byteLength:", fragmentBuffer.byteLength);
				}
			}
			const onClaimBuffer = ()=>
			{
				if(segments.length)
				{
					const segmentBuffer = segments.shift();
					if(RagingSocket.options.logOptions.bufferHashCheck)
					{
						const fragmentBufferHash = Decimalian.fromString(createHash("sha256").update(new Uint8Array(segmentBuffer)).digest("hex"), 16).toString();
						console.log("send full buffer hash:", bufferHash, ", send fragment buffer hash:", fragmentBufferHash, ", byteLength:", segmentBuffer.byteLength);
					}
					toServerSocket.emit(eventName, segmentBuffer);
				}
				else
				{
					toServerSocket.off(eventName, onClaimBuffer);
					toServerSocket.emit(eventName, "end");
					if(RagingSocket.options.logOptions.bufferHashCheck)
						console.log("sent all buffer hash:", bufferHash);
				}
			}
			const eventName = "s2c_"+bufferHash;
			toServerSocket.on(eventName, onClaimBuffer);
			onClaimBuffer();
		})
	});

	toServerSocket.on(SocketMessage.S2C_RESULT_BUFFER_RECEIVED, (bufferId)=>
	{
		sendMyStatus(toServerSocket);
	});
}

const claimSplitBufferData = (toServerSocket, bufferHash, taskId, dataName)=>
{
	const segments = [];
	if(typeof receivingBufferHash[bufferHash] === "undefined") receivingBufferHash[bufferHash] = [];
	receivingBufferHash[bufferHash].push({taskId, dataName});
	if(receivingBufferHash[bufferHash].length > 1) return;

	const onReceiveBuffer = (arrayBuffer) =>
	{
		const logOptions = RagingSocket.options.logOptions;
		const bufferHashCheck = logOptions.bufferHashCheck;
		if(arrayBuffer !== "end")
		{
			segments.push(arrayBuffer);
			if(bufferHashCheck)
			{
				const fragmentBufferHash = Decimalian.fromString(createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex"), 16).toString();
				console.log("receive buffer hash:", bufferHash, " fragment buffer hash:", fragmentBufferHash, ", byteLength:", arrayBuffer.byteLength);
			}
			toServerSocket.emit(eventName);
		}
		else
		{
			toServerSocket.off(eventName, onReceiveBuffer);

			if(!segments.length)
			{
				if(logOptions.taskTraceLevel > 2)
					console.log("受信予定のバイナリハッシュ'", bufferHash, "' が送られてこなかったため、サーバーにバイナリを再要求します。", taskId);

				toServerSocket.on(eventName, onReceiveBuffer);
				toServerSocket.emit(SocketMessage.C2S_CLAIM_SPLIT_BUFFER_DATA, bufferHash);
				return;
			}

			const byteLength = (segments.length - 1) * 1_000_000 + segments[segments.length - 1].byteLength;
			const byteArray = new Uint8Array(byteLength);
			const len = segments.length;
			for(let i=0; i<len; i++)
			{
				if(bufferHashCheck)
				{
					const fragmentBufferHash = Decimalian.fromString(createHash("sha256").update(new Uint8Array(segments[0])).digest("hex"), 16).toString()
					console.log("received buffer hash:", bufferHash, ", fragment buffer hash:", fragmentBufferHash, ", byteLength:", segments[0].length);
				}

				byteArray.set(new Uint8Array(segments.shift()), i * 1_000_000);
			}
			const resultBuffer = byteArray.buffer;
			const resultBufferHash = Decimalian.fromString(createHash("sha256").update(byteArray).digest("hex"), 16).toString();

			if(bufferHashCheck)
				console.log("サーバーから受信予定の結合バイナリのハッシュ:", bufferHash, ", byteLength:", Buffer.byteLength(resultBuffer), ", 受信後のバイナリハッシュ:", resultBufferHash);


			if(resultBufferHash !== bufferHash)
			{
				if(logOptions.taskTraceLevel > 2)
					console.log("サーバーから受信予定のバイナリハッシュ'", bufferHash, "' と、受信後の結合バイナリハッシュ'", resultBufferHash, "' が一致しなかったので、サーバーにバイナリを再要求します。 taskId:", taskId);

				toServerSocket.on(eventName, onReceiveBuffer);
				toServerSocket.emit(SocketMessage.C2S_CLAIM_SPLIT_BUFFER_DATA, bufferHash);
			}
			else
			{
				if(timeLimitedBufferCache) timeLimitedBufferCache.write(bufferHash, resultBuffer);

				const length = receivingBufferHash[bufferHash].length;
				let transferred = 0;
				for(let i=0; i<length; i++)
				{
					const {taskId, dataName} = receivingBufferHash[bufferHash][i];
					assignedWorker[taskId].sendToSubWorker.transfer(resultBuffer, dataName, false, ()=>
					{
						transferred++;

						if(transferred >= length)
							toServerSocket.emit(SocketMessage.C2S_RECEIVED_ALL_SPLIT_BUFFER_DATA, bufferHash);
					});
				}

				receivingBufferHash[bufferHash] = null;
				delete receivingBufferHash[bufferHash];
			}
		}
	}
	const eventName = "c2s_" + bufferHash;
	toServerSocket.on(eventName, onReceiveBuffer);
	toServerSocket.emit(SocketMessage.C2S_CLAIM_SPLIT_BUFFER_DATA, bufferHash);
}

const removeRequest = (taskId)=>
{
	const request = receivedRequests[taskId];
	/** @type {string[]} */
	const processes = (()=>
	{
		if(request.assignedProcessType === "cpu") return RagingSocket.myStatus.runningCpuProcesses;
		else return RagingSocket.myStatus.runningGpuProcesses;
	})();

	if(!processes.includes(taskId))
		throw new Error("failed removeRequest taskId: " + taskId);

	processes.splice(processes.indexOf(taskId), 1);

	const logOptions = RagingSocket.options.logOptions;
	if(logOptions.taskTraceLevel > 2)
		console.log("タスクリストから削除:", RequestTask.getTaskNameFromTaskId(taskId));
}

/**
 *
 * @param {ToServerSocket} toServerSocket
 */
const sendMyStatus = (toServerSocket)=>
{
	if(!toServerSocket.sendStatusCooldown) sendMyStatusFunc(toServerSocket);
	else toServerSocket.hasSendStatusQueue = true;
}

/**
 *
 * @param {ToServerSocket} toServerSocket
 */
const sendMyStatusFunc = (toServerSocket)=>
{
	toServerSocket.hasSendStatusQueue = false;
	const myStatus = RagingSocket.myStatus;
	myStatus.cpuIdles = cpuIdleCheck();

	const report = {};
	report.cpuIdles = myStatus.cpuIdles;
	report.packages = myStatus.packages;
	report.gpuLength = myStatus.gpuLength;
	report.runningCpuProcesses = myStatus.runningCpuProcesses;
	report.runningGpuProcesses = myStatus.runningGpuProcesses;

	toServerSocket.emit(SocketMessage.C2S_STATUS_REPORT, report);
	if(RagingSocket.options.logOptions.showStatusReport)
		toServerSocket.reportAssist.logOutputStatusReport(myStatus, toServerSocket.ipAddress);

	toServerSocket.sendStatusCooldown = setTimeout(()=>
	{
		toServerSocket.sendStatusCooldown = null;
		if(toServerSocket.hasSendStatusQueue) sendMyStatusFunc(toServerSocket);
	}, RagingSocket.options.statusReportCooldownTime);
}

module.exports = ToServerSocket;