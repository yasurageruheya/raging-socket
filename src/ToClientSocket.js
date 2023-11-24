const ClientStatus = require("./ClientStatus");
const ToServerSocket = require("./ToServerSocket");
const SocketMessage = require("./SocketMessage");
const RagingSocket = require("./RagingSocket");
const RagingSocketOptions = require("./RagingSocketOptions");
const ServerWork = require("./ServerWork");

/** @type {Object.<ToClientSocket>} */
const instances = {};

const RequestTask = require("./RequestTask");

/** @type {PackageManager} */
let packageManager;

/**
 * @typedef {"complete"|"error"|"processing"|"start"} TaskStatus
 */

class ToClientSocket
{
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

	/**
	 *
	 * @param {Socket} clientSocket
	 * @return {ToClientSocket}
	 */
	static setupClient(clientSocket)
	{
		console.log(clientSocket.handshake);
		const ipAddress = clientSocket.handshake.address;
		if(typeof instances[ipAddress] === "undefined") instances[ipAddress] = new ToClientSocket();
		if(instances[ipAddress].socket !== clientSocket) setup(instances[ipAddress], clientSocket, ipAddress);
		return instances[ipAddress];
	}

	static initialize()
	{
		packageManager = RagingSocket.manager;
	}

	constructor()
	{
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
			const request = RequestTask.getIncompleteTask(response.taskId);
			request.statusUpdate();
			this.socket.once(SocketMessage.C2S_RECEIVED_TRANSFER_DATA_NAME, ()=>
			{
				request.statusUpdate();
				this.socket.once(SocketMessage.C2S_RECEIVED_TRANSFER_DATA, ()=>
				{
					request.statusUpdate();
					resolve(response);
				});
				this.socket.emit(SocketMessage.S2C_SEND_TRANSFER_DATA, data);
			});
			this.socket.emit(SocketMessage.S2C_SEND_TRANSFER_DATA_NAME, dataName);
		})
	}

	/**
	 *
	 * @param {ToClientResponse} response
	 * @param {*} data
	 * @return {Promise<ToClientSocket>}
	 */
	vars(response, data)
	{
		return new Promise(resolve =>
		{
			const request = RequestTask.getIncompleteTask(response.taskId);
			this.socket.once(SocketMessage.C2S_RECEIVED_VARS, ()=>
			{
				request.statusUpdate();
				resolve(response);
			});
			this.socket.emit(SocketMessage.S2C_SEND_VARS, data);
			request.statusUpdate();
		});
	}

	start(response)
	{
		return new Promise(resolve =>
		{
			const request = RequestTask.getIncompleteTask(response.taskId);
			//todo:
		});
	}
}

/**
 * @typedef {ArrayBuffer|MessagePort|ImageBitmap} TransferableObject
 */

const setup = (toClientSocket, clientSocket, ipAddress)=>
{
	toClientSocket.socket = clientSocket;
	ToServerSocket.connect(ipAddress);
	clientSocket.emit(SocketMessage.S2C_CLAIM_STATUS);

	clientSocket.on(SocketMessage.C2S_STATUS_REPORT,
		/** @param {ClientStatus} clientStatusReport */
		(clientStatusReport)=>
		{
			for(const key in clientStatusReport)
			{
				this.status[key] = clientStatusReport[key];
			}
			this.status.cpuIdleThresholdCounted = false;

			if(this.status.idleCpuLength > 0 || this.status.idleGpuLength > 0)
			{
				ServerWork.reassign();
			}
			// this.status = clientStatusReport;
			// ToServerSocket.ragingSocket.emit(SocketMessage.CLIENT_STATUS_REPORT, clientStatusReport);
		});

	clientSocket.on(SocketMessage.C2S_REPORT_TASKS_STATUS,
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
						reassign.push(report);
						break;
					case SocketMessage.C2S_REQUEST_SOURCECODE:
						report.status = SocketMessage.S2C_RESPONSE_SOURCECODE;
						report.sourcecode = packageManager.getSourcecodeFromSourcecodeHash(report.sourcecodeHash);
						break;
					case SocketMessage.C2S_REQUEST_PACKAGE_BUFFER_FROM_PACKAGE_HASH:
						promises.push(packageManager.getPackageBufferFromPackageHash(report.shortfallPackageHash).then((buffer)=>
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
						}));
						break;
					case SocketMessage.C2S_RESPONSE_PACKAGES_FROM_PACKAGE_HASH:
						promises.push(packageManager.getPackageBufferFromPackages(report.shortfallPackages).then((buffer)=>
						{
							report.status = SocketMessage.S2C_RESPONSE_PACKAGE_BUFFER;
							report.buffer = buffer;
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
				clientSocket.emit(SocketMessage.S2C_TASK_SUPPLEMENTATION, reports);
			});

			if(reassign.length) ServerWork.reassign(reassign);
		});

	clientSocket.on(SocketMessage.C2S_TASK_COMPLETE, report =>
	{
		const request = RequestTask.getIncompleteTask(report.taskId);
		request.markComplete();
		request.resolve({status: "complete", result: report.result});
		clientSocket.emit(SocketMessage.S2C_RECEIVE_RESULT);
	});

	clientSocket.on(SocketMessage.C2S_TASK_ERROR, report =>
	{
		const request = RequestTask.getIncompleteTask(report.taskId);
		request.statusUpdate();
		request.resolve({status: "error", error: report.error, request: request});
		if(RagingSocketOptions.autoRequestTryAgain)
		{
			clientSocket.emit(SocketMessage.S2C_TASK_CANCEL, request.taskId);
			ServerWork.reassign([request]);
		}
	});

	clientSocket.on(SocketMessage.C2S_TASK_STARTED, report =>
	{
		const request = RequestTask.getIncompleteTask(report.taskId);
		request.statusUpdate();
		request.resolve({status: "start", request: request});
	});

	clientSocket.on(SocketMessage.C2S_TASK_PROCESSING, report =>
	{
		const request = RequestTask.getIncompleteTask(report.taskId);
		request.statusUpdate();
		request.resolve({status: "processing", "vars": report.vars, request: request});
	});

	clientSocket.on(SocketMessage.C2S_WORKER_READY, report =>
	{
		const request = RequestTask.getIncompleteTask(report.taskId);
		request.statusUpdate();
		request.resolve({status: "ready", response:})//todo:
	});
}

module.exports = ToClientSocket;