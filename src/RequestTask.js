/** @type {typeof RagingSocket} */
let RagingSocket;

/** @type {typeof ServerWork} */
let ServerWork;

const EventEmitter = require("events");

const Decimalian = require("decimalian");

/** @type {Object.<RequestTask>} */
const incompleteTasks = {};

/** @type {Object.<RequestTask[]>} */
const cpuTaskQueues = {};

/** @type {Object.<RequestTask[]>} */
const gpuTaskQueues = {};

/** @type {Object.<RequestTask[]>} */
const bothTaskQueues = {};

/** @type {Object.<Object.<RequestTask>>} */
const sentTasks = {};

/** @type {Object.<string>} */
const taskNames = {};

/** @type {PackageManager} */
let packageManager;

class RequestTask extends EventEmitter
{
	static initialize()
	{
		ServerWork = require("./ServerWork");
		RagingSocket = require("./RagingSocket");
		packageManager = RagingSocket.packageManager;
	}

	/**
	 *
	 * @param {object} workerData
	 * @param {function} promiseResolve
	 * @param {function} promiseReject
	 * @param {string} processType
	 * @param {string} taskName
	 */
	static queue(workerData, promiseResolve, promiseReject, processType, taskName)
	{
		return new Promise(resolve =>
		{
			packageManager.getModifiedSourcecodeHashesFromJsPath(workerData.jsPath).then(modifiedSourcecodeHash=>
			{
				const logOptions = RagingSocket.options.logOptions;
				if(logOptions.taskTraceLevel > 2)
					console.log("js 解析完了:", workerData.jsPath, taskName);

				const packageHash = packageManager.getPackageHashFromSourcecodeHash(modifiedSourcecodeHash);
				const task = new RequestTask(modifiedSourcecodeHash, packageHash, promiseResolve, promiseReject, workerData, processType, taskName);
				RequestTask.insertIntoQueue(task);
				task.promise.requiredPackages = packageManager.getPackagesFromJsPath(workerData.jsPath);

				resolve();
			});
		});
	}

	static getTaskNameFromTaskId(taskId)
	{
		return taskNames[taskId] || taskId;
	}

	static setTaskNameFromTaskId(taskId, taskName)
	{
		taskNames[taskId] = taskName;
	}

	/**
	 *
	 * @param {RequestTask} requestTask
	 */
	static insertIntoQueue(requestTask)
	{
		const sourcecodeHash = requestTask.sourcecodeHash;
		const queues = (()=>
		{
			switch (requestTask.processType)
			{
				case "cpu": return cpuTaskQueues;
				case "gpu": return gpuTaskQueues;
				case "both": return bothTaskQueues;
			}
		})();

		if(typeof queues[sourcecodeHash] === "undefined") queues[sourcecodeHash] = [];
		queues[sourcecodeHash].push(requestTask);
	}


	static getIncompleteTask(taskId)
	{
		return incompleteTasks[taskId];
	}

	/**
	 *
	 * @return {string[]}
	 */
	static get incompleteTaskNames()
	{
		const array = [];
		for(const key in incompleteTasks)
		{
			array.push(incompleteTasks[key].taskName || incompleteTasks[key].taskId);
		}
		return array;
	}

	static get hasIncompleteTasks() { return Object.keys(incompleteTasks).length > 0; }

	static get incompleteTasksLength() { return Object.keys(incompleteTasks).length; }

	/** @return {Object<RequestTask[]>} */
	static get cpuTaskQueues() { return cpuTaskQueues; }

	/** @return {Object<RequestTask[]>} */
	static get gpuTaskQueues() { return gpuTaskQueues; }

	/** @return {Object<RequestTask[]>} */
	static get bothTaskQueues() { return bothTaskQueues; }

	/**
	 *
	 * @param {string} sourcecodeHash
	 * @param {string} packageHash
	 * @param {function} resolve Promise の resolve
	 * @param {function} reject Promise の reject
	 * @param {object} workerData
	 * @param {string} processType
	 * @param {string} taskName
	 */
	constructor(sourcecodeHash, packageHash, resolve, reject, workerData, processType, taskName)
	{
		super();
		/** @type {string} */
		this.taskId = Decimalian.fromString(Date.now().toString(10) + Math.random().toString(10).slice(2) + Math.random().toString(10).slice(2), 10).toString();

		/** @type {string} */
		this.sourcecodeHash = sourcecodeHash;

		/** @type {string} */
		this.sourcecode = "";

		this.promise = {};

		/** @type {Promise<Object.<dependency>>} */
		this.promise.requiredPackages = null;

		/** @type {Object.<dependency>} */
		this.requiredPackages = null;

		/** @type {string} */
		this.packageHash = packageHash;

		this.resolve = resolve;

		this.reject = reject;

		this.autoRequestTryAgainCount = 0;

		this.autoTimeoutTryAgainCount = 0;

		/** @type {number} */
		this._updatedAt = 0;

		/** @type {NodeJS.Timeout|number} */
		this._timeoutCheckId = 0;

		/** @type {object} */
		this.workerData = workerData;

		/** @type {string} */
		this.processType = processType;

		/** @type {string|null} */
		this.assignedProcessType = null;

		/** @type {string} */
		this.taskName = taskName;

		/** @type {ToClientSocket|ToServerSocket} */
		this.socket = null;

		incompleteTasks[this.taskId] = this;

		taskNames[this.taskId] = taskName;
	}

	reserve()
	{
		const sourcecodeHash = this.sourcecodeHash;

		if(typeof sentTasks[sourcecodeHash] === "undefined") sentTasks[sourcecodeHash] = {};
		sentTasks[sourcecodeHash][this.taskId] = this;

		this.statusUpdate();

		const outbound = createObject(this);
		delete outbound.promise;
		delete outbound._updatedAt;
		delete outbound._timeoutCheckId;
		delete outbound.resolve;
		delete outbound.reject;
		delete outbound.workerData;
		delete outbound._events;
		delete outbound._eventsCount;
		delete outbound._maxListeners;
		delete outbound._idlePrev;
		delete outbound._idleNext;
		delete outbound._idleStart;
		delete outbound._onTimeout;
		delete outbound.socket;

		return outbound;
	}

	statusUpdate()
	{
		timeoutStop(this);
		this._updatedAt = Date.now();

		this._timeoutCheckId = setTimeout(()=>
		{
			if(RagingSocket.options.autoTimeoutTryAgain && this.autoTimeoutTryAgainCount++ > RagingSocket.options.maxAutoTimeoutTryAgain)
			{
				this.tryAgain();
			}
			else
			{
				this.reject({status: "timeout", request: this});
			}
			this.emit("timeout");
			this._updatedAt = 0;
		}, RagingSocket.options.requestTimeout);
	}

	assignCancel()
	{
		timeoutStop(this);
		this.pullOut();
		delete sentTasks[this.sourcecodeHash][this.taskId];
	}

	markComplete()
	{
		delete incompleteTasks[this.taskId];
		delete sentTasks[this.sourcecodeHash][this.taskId];
		for(const taskId in incompleteTasks)
		{
			const task = incompleteTasks[taskId];
			if(task.taskName === this.taskId)
			{
				console.log(task.taskId);
			}
		}
	}

	pullOut()
	{
		this.socket.requests.splice(this.socket.requests.indexOf(this), 1);
		if(this.assignedProcessType === "cpu")
			this.socket.cpuRequests.splice(this.socket.cpuRequests.indexOf(this), 1);
		else
			this.socket.gpuRequests.splice(this.socket.gpuRequests.indexOf(this), 1);

		this.assignedProcessType = null;
	}

	tryAgain()
	{
		const sourcecodeHash = this.sourcecodeHash;
		const taskQueues = (()=>
		{
			switch (this.processType)
			{
				case "cpu": return cpuTaskQueues;
				case "gpu": return gpuTaskQueues;
				case "both": return bothTaskQueues;
			}
		})();
		const index = taskQueues[sourcecodeHash].indexOf(this);
		if(index >= 0) taskQueues[sourcecodeHash].splice(index, 1);

		this.autoTimeoutTryAgainCount = 0;
		this.autoRequestTryAgainCount = 0;
		ServerWork.reassign([this]);
	}
}

const timeoutStop = (request)=>
{
	if(request._timeoutCheckId) clearTimeout(request._timeoutCheckId);
}

/**
 *
 * @param {RequestTask} request
 * @return {RequestTask|{}}
 */
const createObject = (request)=>
{
	const outbound = {};
	for(const key in request)
	{
		if(request[key])
		{
			if(typeof request[key] === "object" && Object.keys(request[key]).length)
				outbound[key] = request[key];
			else if(typeof request[key] !== "function")
				outbound[key] = request[key];
		}
	}

	return outbound;
}

module.exports = RequestTask;