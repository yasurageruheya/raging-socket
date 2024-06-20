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

const RagingSocketOptions = require("./RagingSocketOptions");
const SocketMessage = require("./SocketMessage");
const {EventEmitter} = require("events");

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
		RagingSocket = require("./RagingSocket");
		packageManager = RagingSocket.manager;
		console.log("RagingSocketOptions.logOptions.connectionInfo : ", RagingSocketOptions.logOptions.connectionInfo);
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
		/** @type {Object.<ToClientSocket>} */
		const result = {};
		if(!workableClients) workableClients = ToClientSocket.cpuWorkableClients;
		for(const address in workableClients)
		{
			if(typeof workableClients[address].status.sourcecodes[sourcecodeHash] !== "undefined")
			{
				result[address] = workableClients[address];
			}
		}
		return result;
	}


	static claimStatus()
	{
		for(const address in instances)
		{
			const toClientSocket = instances[address];
			if(toClientSocket.status.statusReported)
			{
				toClientSocket.emit(SocketMessage.S2C_CLAIM_STATUS);
				toClientSocket.status.statusReported = false;
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
		super(ipAddress);

		/** @type {Socket} */
		this.socket = null;

		/** @type {ClientStatus} */
		this.status = new ClientStatus();

		/** @type {RequestTask[]|object[]} */
		this.requests = [];

		/** @type {Array.<Promise.<*>>} */
		this.promises = [];
	}

	/**
	 * @param {ToClientResponse} response
	 * @param {TransferableObject} data
	 * @param {string} [dataName=""]
	 * @return {Promise<ToClientResponse>}
	 */
	transfer(response, data, dataName="")
	{
		return new Promise(resolve =>
		{
			const taskId = response.taskId;
			const request = RequestTask.getIncompleteTask(taskId);
			request.statusUpdate();
			this.once(SocketMessage.C2S_RECEIVED_TRANSFER_DATA, ()=>
			{
				request.statusUpdate();
				resolve(response);
			})
			this.emit(SocketMessage.S2C_SEND_TRANSFER_DATA, taskId, data, dataName);
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
			this.once(SocketMessage.C2S_RECEIVED_VARS, ()=>
			{
				request.statusUpdate();
				resolve(response);
			});
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
		return new Promise((resolve) =>
		{
			const taskId = response.taskId;
			const request = RequestTask.getIncompleteTask(taskId);
			this.once(SocketMessage.C2S_TASK_STARTED, ()=>
			{
				resolve(new FromClientProcessing(request));
			});
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
	toClientSocket.status.toClientSocket = toClientSocket;
	ToServerSocket.connect(ipAddress);
	toClientSocket.emit(SocketMessage.S2C_CLAIM_STATUS);
	const status = toClientSocket.status;
	status.statusReported = false;

	toClientSocket.on(SocketMessage.C2S_STATUS_REPORT,
		/** @param {ClientStatus} clientStatusReport */
		(clientStatusReport)=>
		{
			for(const key in clientStatusReport)
			{
				status[key] = clientStatusReport[key];
			}
			status.cpuIdleThresholdCounted = false;

			if(status.idleCpuLength > 0 || status.idleGpuLength > 0)
			{
				ServerWork.reassign();
			}
			status.statusReported = true;
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
				switch (report.status)
				{
					case SocketMessage.C2S_UNACCEPTABLE_TASK:
						delete reports[taskId];
						request.assignCancel();
						reassign.push(request);
						break;
					case SocketMessage.C2S_REQUEST_SOURCECODE:
						report.status = SocketMessage.S2C_RESPONSE_SOURCECODE;
						report.sourcecode = packageManager.getSourcecodeFromSourcecodeHash(report.sourcecodeHash);
						break;
					case SocketMessage.C2S_REQUEST_PACKAGE_BUFFER_FROM_PACKAGE_HASH:
						promises.push(new Promise(resolve =>
						{
							packageManager.getPackageBufferFromPackageHash(report.shortfallPackageHash).then((buffer)=>
							{
								if(buffer)
								{
									report.status = SocketMessage.S2C_RESPONSE_PACKAGE_BUFFER;
									report.buffer = buffer;
								}
								else
								{
									report.status = SocketMessage.S2C_REQUEST_PACKAGES_FROM_PACKAGE_HASH;
								}
								resolve();
							})
						}));
						break;
					case SocketMessage.C2S_RESPONSE_PACKAGES_FROM_PACKAGE_HASH:
						promises.push(new Promise(resolve =>
						{
							packageManager.getPackageBufferFromPackages(report.shortfallPackages).then((buffer)=>
							{
								report.status = SocketMessage.S2C_RESPONSE_PACKAGE_BUFFER;
								report.buffer = buffer;
								resolve();
							})
						}));
						break;
					case SocketMessage.C2S_CONFIRM_TASKS:
						report.status = SocketMessage.S2C_SEND_WORKER_DATA;
						report.workerData = request.workerData;
						break;
				}

				if(typeof reports[taskId] !== "undefined") request.statusUpdate();
			}

			Promise.all(promises).then(()=>
			{
				if(Object.keys(reports).length)
				{
					toClientSocket.emit(SocketMessage.S2C_TASK_SUPPLEMENTATION, reports);
				}
			});

			if(reassign.length) ServerWork.reassign(reassign);
		});

	toClientSocket.on(SocketMessage.C2S_WORKER_READY, report =>
	{
		const request = RequestTask.getIncompleteTask(report.taskId);
		request.statusUpdate();
		request.resolve(ToClientResponse.getInstance(report.taskId, toClientSocket));
	});



	toClientSocket.on(SocketMessage.C2S_TASK_COMPLETE, report =>
	{
		const taskId = report.taskId;
		const request = RequestTask.getIncompleteTask(taskId);
		request.markComplete();
		const processing = clientProcessingPool[taskId];
		processing.status = "complete";
		processing.result = report.result;
		processing.resolve(report.result);
		processing.emit("complete", processing);
		toClientSocket.emit(SocketMessage.S2C_RECEIVE_RESULT);
		delete clientProcessingPool[report.taskId];
	});

	toClientSocket.on(SocketMessage.C2S_TASK_COMPLETE_AND_AFTER_SEND_BUFFER, report =>
	{
		const processing = clientProcessingPool[report.taskId];
		const bufferId = report.result;
		const segments = [];
		const onReceiveBuffer = (arrayBuffer) =>
		{
			if(arrayBuffer instanceof Buffer) arrayBuffer = arrayBuffer.buffer;
			if(arrayBuffer !== "end")
			{
				segments.push(arrayBuffer);
				toClientSocket.emit(bufferId);
			}
			else
			{
				toClientSocket.off(bufferId, onReceiveBuffer);
				const byteLength = (segments.length - 1) * 1_000_000 +
					segments[segments.length - 1].byteLength;
				const byteArray = new Uint8Array(byteLength);
				const len = segments.length;
				for(let i=0; i<len; i++)
				{
					byteArray.set(segments.shift(), i * 1_000_000);
				}
				const resultBuffer = byteArray.buffer;
				console.log(bufferId, "byteLength:"+Buffer.byteLength(resultBuffer));

				const request = RequestTask.getIncompleteTask(report.taskId);
				toClientSocket.emit(SocketMessage.S2C_RESULT_BUFFER_RECEIVED, bufferId);
				request.markComplete();
				processing.status = "complete";
				processing.result = resultBuffer;
				processing.resolve(resultBuffer);
				processing.emit("complete", processing);
			}
		}
		toClientSocket.on(bufferId, onReceiveBuffer);
		toClientSocket.emit(SocketMessage.S2C_CLAIM_RESULT_BUFFER, bufferId);
	})

	const taskError = (report) =>
	{
		const taskId = report.taskId;
		const request = RequestTask.getIncompleteTask(taskId);
		request.statusUpdate();
		// request.resolve({status: "error", error: report.error, request: request});
		if(RagingSocketOptions.autoRequestTryAgain && request.autoRequestTryAgainCount++ > RagingSocketOptions.maxAutoRequestTryAgain)
		{
			toClientSocket.emit(SocketMessage.S2C_TASK_CANCEL, request.taskId);
			request.tryAgain();
		}
		else
		{
			const processing = clientProcessingPool[report.taskId];
			processing.status = "error";
			processing.error = report.error;
			processing.reject(report.error);
			processing.emit("error", processing);
			delete clientProcessingPool[report.taskId];
		}
	}

	toClientSocket.on(SocketMessage.C2S_TASK_PREPROCESS_ERROR, taskError);
	toClientSocket.on(SocketMessage.C2S_TASK_PROCESSING_ERROR, taskError);

	toClientSocket.on(SocketMessage.C2S_TASK_PROCESSING, report =>
	{
		const request = RequestTask.getIncompleteTask(report.taskId);
		request.statusUpdate();
		const processing = clientProcessingPool[report.taskId];

		processing.status = "processing";
		processing.vars = report.vars;
		processing.emit("processing", processing);
	});
}

/** @type {Object.<FromClientProcessing>} */
const clientProcessingPool = {};

class FromClientProcessing extends EventEmitter
{
	constructor(request) {
		super();
		this.vars = null;
		this.result = null;
		this.error = null;
		this.request = request;
		clientProcessingPool[request.taskId] = this;
	}

	/**
	 *
	 * @return {Promise<*|Error>}
	 */
	complete()
	{
		const proc = this;
		return new Promise((resolve, reject) =>
		{
			proc._resolve = resolve;
			proc._reject = reject;
		});
	}

	resolve(result)
	{
		if(typeof this._resolve !== "undefined") this._resolve(result);
	}

	reject(result)
	{
		if(typeof this._reject !== "undefined") this._reject(result);
	}
}

module.exports = ToClientSocket;