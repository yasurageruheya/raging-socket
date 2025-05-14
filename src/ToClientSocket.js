/** @type {typeof ClientStatus} */
let ClientStatus;

/** @type {typeof ToServerSocket} */
let ToServerSocket;

/** @type {typeof RagingSocket} */
let RagingSocket;

/** @type {typeof ServerWork} */
let ServerWork;

/** @type {typeof ToClientResponse} */
let ToClientResponse;

/** @type {typeof RequestTask} */
let RequestTask;

const SocketEmitter = require("./SocketEmitter");

/** @type {PackageManager} */
let packageManager;

let lastClaimStatusTime = 0;
let isClaimStatusQueue = false;

const SocketMessage = require("./SocketMessage");
const RagingSocketError = require("./RagingSocketError")
const {EventEmitter} = require("events");
const {createHash} = require("crypto");
const Decimalian = require("decimalian");

/** @type {typeof ReportAssist} */
let ReportAssist;

/** Object.<Array.<processing:FromClientProcessing, request:RequestTask>> */
const receivingBufferHash = {};


/** @type {TimeLimitedFileCache} */
let timeLimitedBufferCache;

/** @type {Object.<ToClientSocket>} */
const instances = {};

/**
 * @typedef {"complete"|"error"|"processing"|"start"} TaskStatus
 */

/**
 * @typedef {ArrayBuffer|MessagePort|ImageBitmap} TransferableObject
 */

class ToClientSocket extends SocketEmitter
{
	static initialize()
	{
		ClientStatus = require("./ClientStatus");
		ToServerSocket = require("./ToServerSocket");
		RequestTask = require("./RequestTask");
		ToClientResponse = require("./ToClientResponse");
		ServerWork = require("./ServerWork");
		ReportAssist = require("./ReportAssist");
		RagingSocket = require("./RagingSocket");
		packageManager = RagingSocket.packageManager;

		const TimeLimitedFileCache = require("time-limited-file-cache");
		timeLimitedBufferCache = TimeLimitedFileCache.fromDirectory(RagingSocket.options.bufferCacheDirectory, RagingSocket.options.bufferCacheMemoryTTL, RagingSocket.options.bufferCacheFileTTL);
	}

	static get cpuWorkableClients()
	{
		/** @type {Object.<ToClientSocket>} */
		const workable = {};
		for(const address in instances)
		{
			const toClientSocket = instances[address];
			if(toClientSocket.status.idleCpuLength > 0) workable[address] = toClientSocket;
		}
		return workable;
	}

	static get gpuWorkableClients()
	{
		/** @type {Object.<ToClientSocket>} */
		const workable = {};
		for(const address in instances)
		{
			const toClientSocket = instances[address];
			if(toClientSocket.status.idleGpuLength > 0) workable[address] = toClientSocket;
		}
		return workable;
	}

	/**
	 *
	 * @param {string} sourcecodeHash
	 * @param {Object.<ToClientSocket>} workableClients
	 * @return {Object<ToClientSocket>}
	 */
	static findClientsFromSourcecodeHash(sourcecodeHash, workableClients=null)
	{
		const __PROJECT_SCOPE_MODULE = packageManager.__PROJECT_SCOPE_MODULE;
		/** @type {Object.<ToClientSocket>} */
		const result = {};
		if(!workableClients) workableClients = ToClientSocket.cpuWorkableClients;
		for(const address in workableClients)
		{
			if(typeof workableClients[address].status.packages[__PROJECT_SCOPE_MODULE][sourcecodeHash] !== "undefined")
			{
				result[address] = workableClients[address];
			}
		}
		return result;
	}


	static claimStatus()
	{
		const now = Date.now();
		const reclaimTime = RagingSocket.options.reclaimStatusReportTime;
		if((now - lastClaimStatusTime) < reclaimTime)
		{
			claimStatusFunc();
		}
		else
		{
			if(!isClaimStatusQueue)
			{
				isClaimStatusQueue = true;
				setTimeout(claimStatusFunc, reclaimTime - (now - lastClaimStatusTime));
			}
		}
	}
	/**
	 *
	 * @param {Socket} clientSocket
	 * @return {ToClientSocket}
	 */
	static setupClient(clientSocket)
	{
		console.log(clientSocket.handshake);
		const ipAddress = clientSocket.handshake.address.split("::ffff:").join("");
		if(typeof instances[ipAddress] === "undefined") instances[ipAddress] = new ToClientSocket(ipAddress);
		if(instances[ipAddress].socket !== clientSocket) setup(instances[ipAddress], clientSocket, ipAddress);
		return instances[ipAddress];
	}

	constructor(ipAddress)
	{
		super(ipAddress, packageManager);

		this.reportAssist = ReportAssist.get(this);

		/** @type {Socket} */
		this.socket = null;

		/** @type {ClientStatus} */
		this.status = new ClientStatus();

		/** @type {RequestTask[]|object[]} */
		this.reserveRequests = [];

		/** @type {RequestTask[]|object[]} */
		this.requests = [];

		/** @type {RequestTask[]|object[]} */
		this.cpuRequests = [];

		/** @type {RequestTask[]|object[]} */
		this.gpuRequests = [];

		/** @type {Array.<Promise.<*>>} */
		this.promises = [];

		/** @type {number} */
		this.lastReportStatusTime = 0;
	}

	/**
	 * @param {ToClientResponse} response
	 * @param {TransferableObject} data
	 * @param {string} [dataName=""]
	 * @return {Promise<ToClientResponse>}
	 */
	transfer(response, data, dataName="")
	{
		if(!data) console.log("!!!data is null!!!");
		return new Promise(resolve =>
		{
			const taskId = response.taskId;
			const request = RequestTask.getIncompleteTask(taskId);
			request.statusUpdate();
			const logOptions = RagingSocket.options.logOptions;
			if(data instanceof ArrayBuffer && data.byteLength > 1_000_000)
			{
				const bufferHexHash = createHash("sha256").update(new Uint8Array(Buffer.from(data).buffer)).digest("hex");
				const bufferHash = Decimalian.fromString(bufferHexHash, 16).toString();
				if(logOptions.bufferHashCheck)
					console.log("送信予定の大容量データハッシュ値:", bufferHash, ", byteLength:", Buffer.byteLength(data));

				timeLimitedBufferCache.write(bufferHash, data);

				this.once(SocketMessage.C2S_RECEIVED_ALL_SPLIT_BUFFER_DATA, (bufferHash) =>
				{
					request.statusUpdate();
					resolve(response);

					if(logOptions.taskTraceLevel > 2)
						console.log("クライアントから全ての分割データ受信を確認:", this.ipAddress, RequestTask.getTaskNameFromTaskId(response.taskId));
				});

				if(logOptions.taskTraceLevel > 2)
					console.log("クライアントへ大容量分割データ送信を通知:", this.ipAddress, RequestTask.getTaskNameFromTaskId(response.taskId));

				this.emit(SocketMessage.S2C_SEND_SPLIT_BUFFER_DATA, taskId, bufferHash, dataName);
			}
			else
			{
				this.once(SocketMessage.C2S_RECEIVED_TRANSFER_DATA, ()=>
				{
					request.statusUpdate();
					resolve(response);

					if(logOptions.taskTraceLevel > 2)
						console.log("クライアントの大容量データ受信を確認:", this.ipAddress, RequestTask.getTaskNameFromTaskId(response.taskId));
				});

				if(logOptions.taskTraceLevel > 2)
					console.log("クライアントに大容量データを送信:", this.ipAddress, RequestTask.getTaskNameFromTaskId(response.taskId));

				this.emit(SocketMessage.S2C_SEND_TRANSFER_DATA, taskId, data, dataName);
			}
		})
	}

	/**
	 *
	 * @param {ToClientResponse} response
	 * @param {*} data
	 * @return {Promise<ToClientResponse>}
	 */
	vars(response, data)
	{
		return new Promise(resolve =>
		{
			const taskId = response.taskId;
			const request = RequestTask.getIncompleteTask(taskId);
			const logOptions = RagingSocket.options.logOptions;
			this.once(SocketMessage.C2S_RECEIVED_VARS, ()=>
			{
				request.statusUpdate();
				resolve(response);

				if(logOptions.taskTraceLevel > 2)
					console.log("クライアントの変数受信を確認:", this.ipAddress, RequestTask.getTaskNameFromTaskId(response.taskId));
			});

			if(logOptions.taskTraceLevel > 2)
				console.log("クライアントに変数を送信:", this.ipAddress, RequestTask.getTaskNameFromTaskId(response.taskId));

			this.emit(SocketMessage.S2C_SEND_VARS, taskId, data);
			request.statusUpdate();
		});
	}

	/**
	 *
	 * @param {ToClientResponse} response
	 * @return {Promise<FromClientProcessing>}
	 */

	start(response)
	{
		return new Promise((resolve, reject) =>
		{
			const taskId = response.taskId;
			const request = RequestTask.getIncompleteTask(taskId);
			const logOptions = RagingSocket.options.logOptions;
			this.once(SocketMessage.C2S_TASK_STARTED, ()=>
			{
				if(logOptions.taskTraceLevel > 0)
					console.log("クライアントのタスク開始を確認:", this.ipAddress, RequestTask.getTaskNameFromTaskId(response.taskId));

				resolve(processing);
			});

			if(logOptions.taskTraceLevel > 2)
				console.log("クライアントへタスク開始を要求:", this.ipAddress, RequestTask.getTaskNameFromTaskId(response.taskId));

			const processing = new FromClientProcessing(request, reject);
			this.emit(SocketMessage.S2C_TASK_START, taskId);
			request.statusUpdate();
		});
	}
}
/**
 *
 * @param {ToClientSocket} toClientSocket
 * @param {Socket} clientSocket
 * @param {string} ipAddress
 */
const setup = (toClientSocket, clientSocket, ipAddress)=>
{
	toClientSocket.socket = clientSocket;
	const status = toClientSocket.status;
	status.toClientSocket = toClientSocket;
	// ToServerSocket.connect(ipAddress);
	toClientSocket.emit(SocketMessage.S2C_CLAIM_STATUS);
	status.canClaimStatusReport = true;

	const reportAssist = ReportAssist.get(toClientSocket);

	const logOptions = RagingSocket.options.logOptions;

	toClientSocket.on(SocketMessage.C2S_STATUS_REPORT,
		/** @param {ClientStatus} clientStatusReport */
		(clientStatusReport)=>
		{
			toClientSocket.lastReportStatusTime = Date.now();
			for(const key in clientStatusReport)
			{
				status[key] = clientStatusReport[key];
			}
			status.cpuIdleThresholdCounted = false;

			if(logOptions.showClientStatusReport)
				reportAssist.logOutputStatusReport(status, toClientSocket.ipAddress);

			if(logOptions.showIncompleteTasks)
			{
				const incompleteTaskNames = RequestTask.incompleteTaskNames;
				const length = incompleteTaskNames.length;
				console.log("未完了タスク:", length, '"' + incompleteTaskNames.slice(-10).join('", "') + '"' + (length > 10 ? "..." : ""));
			}

			if(status.idleCpuLength > 0 || status.idleGpuLength > 0)
			{
				ServerWork.reassign();
			}
			else if(RequestTask.hasIncompleteTasks)
			{
				// console.log("reclaim!!");
				setTimeout(ToClientSocket.claimStatus, 1000);
			}
			status.canClaimStatusReport = true;
		});

	toClientSocket.on(SocketMessage.C2S_REPORT_TASKS_STATUS,
		/** @type {Object.<RequestTask>} */
		(reports)=>
		{
			/** @type {RequestTask[]} */
			const reassign = [];
			const promises = [];
			for(const taskId in reports)
			{
				const report = reports[taskId];
				const request = RequestTask.getIncompleteTask(taskId);
				if(!request) continue;
				switch (report.status)
				{
					case SocketMessage.C2S_UNACCEPTABLE_TASK:
						reportAssist.taskRejected(report, request);
						delete reports[taskId];
						reassign.push(request);
						break;
					case SocketMessage.C2S_REQUEST_SOURCECODE:
						promises.push(reportAssist.responseSourcecode(report, request));
						break;
					case SocketMessage.C2S_REQUEST_PACKAGE_BUFFER_FROM_PACKAGE_HASH:
						promises.push(reportAssist.packageBufferRequested(report, request));
						break;
					case SocketMessage.C2S_RESPONSE_PACKAGES_FROM_PACKAGE_HASH:
						promises.push(reportAssist.receiveShortfallPackages(report, request));
						break;
					case SocketMessage.C2S_CONFIRM_TASKS:
						reportAssist.sendWorkerData(report, request);

						break;
				}

				if(typeof reports[taskId] !== "undefined") request.statusUpdate();
			}

			reportAssist.logOutput();

			Promise.all(promises).then(()=>
			{
				//todo: reportAssist.sendWorkerData を通ってきたっぽいけど、タスク開始要求をクライアントに送らない事があった！！！
				reportAssist.logOutput();
				if(Object.keys(reports).length)
					toClientSocket.emit(SocketMessage.S2C_TASK_SUPPLEMENTATION, reports);
			});

			if(reassign.length) ServerWork.reassign(reassign);
		});

	toClientSocket.on(SocketMessage.C2S_WORKER_READY, report =>
	{
		const taskId = report.taskId
		const request = RequestTask.getIncompleteTask(taskId);
		if(!request)
			throw new Error("non exist task:" + RequestTask.getTaskNameFromTaskId(taskId));
		request.statusUpdate();
		request.resolve(ToClientResponse.getInstance(taskId, toClientSocket, request.taskName));

		if(logOptions.taskTraceLevel > 2)
			console.log("クライアントからタスク開始準備完了を確認:", toClientSocket.ipAddress, RequestTask.getTaskNameFromTaskId(taskId));
	});



	toClientSocket.on(SocketMessage.C2S_TASK_COMPLETE, report =>
	{
		const taskId = report.taskId;
		const request = RequestTask.getIncompleteTask(taskId);
		request.markComplete();
		/** @type {FromClientProcessing|any} */
		const processing = clientProcessingPool[taskId];
		processing.status = "complete";
		processing.result = report.result;
		processing.resolve(report.result);
		console.log("processing.resolve");
		processing.emit("complete", processing);
		toClientSocket.emit(SocketMessage.S2C_RECEIVE_RESULT);
		delete clientProcessingPool[report.taskId];

		if(logOptions.taskTraceLevel > 2)
			console.log("クライアントのタスク完了を確認:", toClientSocket.ipAddress, RequestTask.getTaskNameFromTaskId(taskId));
	});

	toClientSocket.on(SocketMessage.C2S_TASK_COMPLETE_AND_AFTER_SEND_BUFFER, report =>
	{
		/** @type {FromClientProcessing|any} */
		const processing = clientProcessingPool[report.taskId];
		const taskId = report.taskId;
		const request = RequestTask.getIncompleteTask(taskId);
		const bufferHash = report.result;

		const bufferHashCheck = logOptions.bufferHashCheck;

		if(logOptions.taskTraceLevel > 2)
			console.log("クライアントのタスク完了と完了後データ送信準備完了を確認:", toClientSocket.ipAddress, RequestTask.getTaskNameFromTaskId(taskId));

		new Promise(resolve=>
		{
			if(timeLimitedBufferCache) timeLimitedBufferCache.read(bufferHash).then(data => resolve(data));
			else resolve();
		}).then(data=>
		{
			if(data)
			{
				if(logOptions.taskTraceLevel > 2)
					console.log("クライアントが送信予定のデータは既にサーバーに保存されているデータと一致したため、データの送信要求をスキップ:", toClientSocket.ipAddress, RequestTask.getTaskNameFromTaskId(taskId));

				toClientSocket.emit(SocketMessage.S2C_RESULT_BUFFER_RECEIVED, bufferHash);
				request.markComplete();
				processing.status = "complete";
				processing.result = data;
				processing.resolve(data);

				processing.emit("complete", processing);
			}
			else
			{
				if(typeof receivingBufferHash[bufferHash] === "undefined") receivingBufferHash[bufferHash] = [];
				receivingBufferHash[bufferHash].push({processing, request});
				if(receivingBufferHash[bufferHash].length > 1)
					return;

				const segments = [];
				const onReceiveBuffer = (arrayBuffer) =>
				{
					if(arrayBuffer !== "end")
					{
						segments.push(arrayBuffer);
						if(bufferHashCheck)
						{
							const fragmentBufferHash = Decimalian.fromString(createHash("sha256").update(new Uint8Array(arrayBuffer)).digest("hex"), 16).toString();
							console.log("クライアントから受信予定の全データのハッシュ:", bufferHash, ", 受信した分割データのハッシュ:", fragmentBufferHash, ", byteLength:", arrayBuffer.byteLength);
						}
						toClientSocket.emit(eventName);
					}
					else
					{
						toClientSocket.off(eventName, onReceiveBuffer);

						if(!segments.length)
						{
							if(logOptions.taskTraceLevel > 2)
								console.log("クライアントから受信予定の全データが全て送られてこなかったため、データ送信を再要求します。再要求する全データのハッシュ:", bufferHash, RequestTask.getTaskNameFromTaskId(taskId));

							toClientSocket.on(eventName, onReceiveBuffer);
							toClientSocket.emit(SocketMessage.S2C_CLAIM_RESULT_BUFFER, bufferHash);
							return;
						}

						const byteLength = (segments.length - 1) * 1_000_000 + segments[segments.length - 1].byteLength;
						const byteArray = new Uint8Array(byteLength);
						const len = segments.length;
						const hashes = [];
						for(let i=0; i<len; i++)
						{
							const fragment = new Uint8Array(segments.shift());
							if(bufferHashCheck)
							{
								const fragmentBufferHash = Decimalian.fromString(createHash("sha256").update(fragment).digest("hex"), 16).toString();
								hashes.push(fragmentBufferHash);
							}

							byteArray.set(fragment, i * 1_000_000);
						}

						if(bufferHashCheck)
							console.log("クライアントから受信予定の全データのハッシュ:", bufferHash, ", 受信した分割データのハッシュ[", hashes.join(","), "]");

						const resultBuffer　 = byteArray.buffer;
						const receivedBufferHash = Decimalian.fromString(createHash("sha256").update(Buffer.from(byteArray)).digest("hex"), 16).toString();

						if(bufferHashCheck)
							console.log("クライアントから受信予定の全データのハッシュ:", bufferHash, ", byteLength:", Buffer.byteLength(resultBuffer), ", 受信後の結合データのハッシュ:", receivedBufferHash);


						if(receivedBufferHash !== bufferHash)
						{
							if(logOptions.taskTraceLevel > 2)
								console.log("クライアントから受信予定の全データのハッシュ'", bufferHash, "' と、受信後の結合データのハッシュ'", receivedBufferHash, "' が一致しなかったので、クライアントにデータ送信を再要求します。", RequestTask.getTaskNameFromTaskId(taskId));
							// throw new Error("received result buffer hash error." + "receivedFullBufferHash : " + receivedBufferHash +", bufferHash : " + bufferHash);
							toClientSocket.on(eventName, onReceiveBuffer);
							toClientSocket.emit(SocketMessage.S2C_CLAIM_RESULT_BUFFER, bufferHash);
						}
						else
						{
							if(timeLimitedBufferCache) timeLimitedBufferCache.write(receivedBufferHash, resultBuffer);

							const length = receivingBufferHash[bufferHash].length;
							for(let i=0; i<length; i++)
							{
								const {processing, request} = receivingBufferHash[bufferHash][i];
								request.markComplete();
								processing.status = "complete";
								processing.result = resultBuffer;
								processing.resolve(resultBuffer);

								// console.log("processing.resolve");
								processing.emit("complete", processing);
							}
							toClientSocket.emit(SocketMessage.S2C_RESULT_BUFFER_RECEIVED, bufferHash);

							receivingBufferHash[bufferHash] = null;
							delete receivingBufferHash[bufferHash];
							clientProcessingPool[report.taskId] = null;
							delete clientProcessingPool[report.taskId];

							if(logOptions.taskTraceLevel > 2)
								console.log("クライアントへタスク完了後データ受信完了を通知:", toClientSocket.ipAddress, RequestTask.getTaskNameFromTaskId(taskId));
						}
					}
				}
				const eventName = "s2c_"+bufferHash;
				toClientSocket.on(eventName, onReceiveBuffer);

				if(logOptions.taskTraceLevel > 2)
					console.log("クライアントへタスク完了後データを要求:", toClientSocket.ipAddress, RequestTask.getTaskNameFromTaskId(taskId));

				toClientSocket.emit(SocketMessage.S2C_CLAIM_RESULT_BUFFER, bufferHash);
			}
		});
	});

	toClientSocket.on(SocketMessage.C2S_CLAIM_SPLIT_BUFFER_DATA, (bufferHash)=>
	{
		const isBufferHashCheck = RagingSocket.options.logOptions.bufferHashCheck;

		new Promise(resolve =>
		{
			timeLimitedBufferCache.read(bufferHash).then(data=> resolve(data));

		}).then(/** @param {ArrayBuffer|undefined} originalBuffer */ originalBuffer =>
		{
			if(!originalBuffer)
				throw RagingSocketError.getTimeLimitedFileCacheTTLError(bufferHash);

			const segments = [];
			const byteLength = originalBuffer.byteLength;
			if(isBufferHashCheck)
			{
				const originalBufferHash = Decimalian.fromString(createHash("sha256").update(new Uint8Array(originalBuffer)).digest("hex"), 16).toString();
				console.log("scheduled to send original buffer hash:", originalBufferHash, ", byteLength:", byteLength);
			}
			for(let i=0; i<byteLength; i += 1_000_000)
			{
				const fragmentBuffer = originalBuffer.slice(i, i + 1_000_000);
				segments.push(fragmentBuffer);

				if(isBufferHashCheck)
				{
					const fragmentBufferHash = Decimalian.fromString(createHash("sha256").update(new Uint8Array(fragmentBuffer)).digest("hex"), 16).toString();
					console.log("scheduled to send buffer hash:", bufferHash, ", fragment buffer hash:", fragmentBufferHash, ", byteLength:", fragmentBuffer.byteLength);
				}
			}
			const onClaimBuffer = ()=>
			{
				if(segments.length)
				{
					const segmentBuffer = segments.shift();
					if(isBufferHashCheck)
					{
						const segmentBufferHash = Decimalian.fromString(createHash("sha256").update(new Uint8Array(segmentBuffer)).digest("hex"), 16).toString();
						console.log("send buffer hash:", bufferHash, ", fragment buffer hash:", segmentBufferHash, ", byteLength:", segmentBuffer.byteLength);
					}
					toClientSocket.emit(eventName, segmentBuffer);
				}
				else
				{
					toClientSocket.off(eventName, onClaimBuffer);
					toClientSocket.emit(eventName, "end");
				}
			}
			const eventName = "c2s_"+bufferHash;
			toClientSocket.on(eventName, onClaimBuffer);
			onClaimBuffer();
		});
	});

	const preProcessError = (report) =>
	{
		const isTaskTryAgain = taskError(report);
		if(!isTaskTryAgain)
		{
			//todo: クライアントが正常に Worker を起動できなかった時にココの処理に来るが、その後にタスク依頼を再挑戦するかどうかとか、どうすればいいのかをちゃんと考える
			console.log("ここに到達する事があったら、その後どう処理すればいいのか");
		}
	}

	const processingError = (report) =>
	{
		const isTaskTryAgain = taskError(report);
		if(!isTaskTryAgain)
		{
			/** @type {FromClientProcessing|any} */
			const processing = clientProcessingPool[report.taskId];
			processing.status = "error";
			processing.reject(report.error);
			if(processing.listenerCount("error") > 0) processing.emit("error", processing);
			delete clientProcessingPool[report.taskId];
		}
	}

	/**
	 *
	 * @param report
	 * @return {boolean} タスク振り分けを再試行したかどうか
	 */
	const taskError = (report) =>
	{
		const taskId = report.taskId;
		const request = RequestTask.getIncompleteTask(taskId);
		request.statusUpdate();

		if(logOptions.taskTraceLevel > 0)
			console.log("タスクエラーを受信:", toClientSocket.ipAddress, RequestTask.getTaskNameFromTaskId(taskId), report);

		// request.resolve({status: "error", error: report.error, request: request});
		toClientSocket.emit(SocketMessage.S2C_TASK_CANCEL, request.taskId);

		if(RagingSocket.options.autoRequestTryAgain && request.autoRequestTryAgainCount++ > RagingSocket.options.maxAutoRequestTryAgain)
		{
			request.tryAgain();
			return true;
		}
		return false;
	}

	toClientSocket.on(SocketMessage.C2S_TASK_PREPROCESS_ERROR, preProcessError);
	toClientSocket.on(SocketMessage.C2S_TASK_PROCESSING_ERROR, processingError);

	toClientSocket.on(SocketMessage.C2S_TASK_PROCESSING, report =>
	{
		const request = RequestTask.getIncompleteTask(report.taskId);
		request.statusUpdate();
		/** @type {FromClientProcessing|any} */
		const processing = clientProcessingPool[report.taskId];

		if(logOptions.taskTraceLevel > 2)
			console.log("クライアントから変数を受信:", toClientSocket.ipAddress, RequestTask.getTaskNameFromTaskId(report.taskId));

		if(!processing)
		{
			//todo: ↓の行に来ないような設計にしないといけない！！！！
			throw new Error("non exist processing. taskId: " + report.taskId + ", taskName: " + request.taskName);
		}

		processing.status = "processing";
		processing.vars = report.vars;
		processing.emit("processing", processing);
	});

	toClientSocket.emit(SocketMessage.S2C_CONNECT_SUCCESS);
	toClientSocket.on(SocketMessage.C2S_CONNECT_SUCCESS, ()=>
	{
		console.log("クライアント", ipAddress, "との接続が完了しました");
	});
}

const claimStatusFunc = ()=>
{
	const now = lastClaimStatusTime = Date.now();
	isClaimStatusQueue = false;
	for(const address in instances)
	{
		const toClientSocket = instances[address];
		// console.log("toClientSocket.requests.length:", toClientSocket.requests.length);
		if(toClientSocket.requests.length) continue;

		if(toClientSocket.status.canClaimStatusReport)
		{
			toClientSocket.status.canClaimStatusReport = false;
			toClientSocket.lastReportStatusTime = lastClaimStatusTime;
			toClientSocket.emit(SocketMessage.S2C_CLAIM_STATUS);
		}
		else
		{
			const timeLag = now - toClientSocket.lastReportStatusTime;
			if(timeLag > RagingSocket.options.offlineDetectionTimeLimit)
			{
				console.log("offlineDetection:", (now - toClientSocket.lastReportStatusTime));
				//todo: このクライアントは起動していない物とみなすための処理をしなきゃ！！！！
			}
			else if(timeLag > RagingSocket.options.statusReportCooldownTime)
			{
				// console.log("reclaim:", (now - toClientSocket.lastReportStatusTime));
				toClientSocket.status.canClaimStatusReport = false;
				toClientSocket.lastReportStatusTime = lastClaimStatusTime;
				toClientSocket.emit(SocketMessage.S2C_CLAIM_STATUS);
			}
		}
	}
}

/** @type {Object.<FromClientProcessing>} */
const clientProcessingPool = {};

class FromClientProcessing extends EventEmitter
{
	/** @type {(value:any)=>void}  */
	#resolve;

	/** @type {(reason?:any)=>void} */
	#reject;

	/** @type {boolean} */
	#isRejected;

	/** @type {any|*} */
	vars;

	/** @type {any|*} */
	result;

	/** @type {Error} */
	error;

	/** @type {RequestTask} */
	request;

	/** @type {string|null} */
	status;

	/**
	 *
	 * @param {RequestTask} request
	 * @param {(reason?:any)=>void} reject
	 */
	constructor(request, reject) {
		super();
		this.request = request;
		this.#reject = reject;
		clientProcessingPool[request.taskId] = this;
	}

	get taskName() { return this.request.taskName; }

	get taskId() { return this.request.taskId; }

	/**
	 *
	 * @return {Promise<FromClientProcessing>}
	 */
	complete()
	{
		const proc = this;
		return new Promise((resolve, reject) =>
		{
			// ToClientResponse の事前処理で、resolve() が呼ばれた後、この complete() メソッドが呼ばれる前に ToClientResponse の reject() が呼び出されるが、resolve 後では reject が発動したいため、ここで既に reject が発生済みかどうかをチェックする必要がある
			if(proc.#isRejected) return reject(proc);

			const logOptions = RagingSocket.options.logOptions;
			if(logOptions.taskTraceLevel > 0)
				console.log("タスク完了を待機:", proc.request.socket.ipAddress, RequestTask.getTaskNameFromTaskId(proc.request.taskId));

			proc.#resolve = resolve;
			proc.#reject = reject;
		});
	}

	resolve(result)
	{
		if(typeof this.#resolve !== "undefined")
		{
			this.result = result;
			this.#resolve(this);
		}

		const logOptions = RagingSocket.options.logOptions;
		if(logOptions.taskTraceLevel > 0)
			console.log("タスク完了:", this.request.socket.ipAddress, RequestTask.getTaskNameFromTaskId(this.request.taskId));
	}

	reject(result)
	{
		this.#isRejected = true;
		if(typeof this.#reject !== "undefined")
		{
			this.error = result;
			this.#reject(this);
		}

		const logOptions = RagingSocket.options.logOptions;
		if(logOptions.taskTraceLevel > 0)
			console.log("タスク失敗:", this.request.socket.ipAddress, RequestTask.getTaskNameFromTaskId(this.request.taskId));

		this.request.markComplete();
	}
}

module.exports = ToClientSocket;