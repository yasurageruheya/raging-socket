/** @type {typeof RagingSocket} */
let RagingSocket;

/** @type {typeof ServerWork} */
let ServerWork;

const EventEmitter = require("events");

const RagingSocketOptions = require("./RagingSocketOptions");

/** @type {Object.<RequestTask>} */
const incompleteTasks = {};

/** @type {Object.<RequestTask[]>} */
const cpuTaskQueues = {};

/** @type {Object.<RequestTask[]>} */
const gpuTaskQueues = {};

/** @type {Object.<Object.<RequestTask>>} */
const sentTasks = {};

/** @type {PackageManager} */
let packageManager;

class RequestTask extends EventEmitter
{
	static initialize()
	{
		ServerWork = require("./ServerWork");
		RagingSocket = require("./RagingSocket");
		packageManager = RagingSocket.manager;
	}

	/**
	 *
	 * @param {object} workerData
	 * @param {function} promiseResolve
	 * @param {function} promiseReject
	 * @param {string} processType
	 */
	static queue(workerData, promiseResolve, promiseReject, processType)
	{
		packageManager.getModifiedSourcecodeHashesFromJsPath(workerData.jsPath).then(modifiedSourcecodeHash=>
		{
			const packageHash = packageManager.getPackageHashFromSourcecodeHash(modifiedSourcecodeHash);
			const task = new RequestTask(modifiedSourcecodeHash, packageHash, promiseResolve, promiseReject, workerData, processType);
			RequestTask.insertIntoQueue(task);
			// task.promise.requiredPackages = packageManager.getPackagesFromSourcecode(modifiedSourcecodeHash);
			task.promise.requiredPackages = packageManager.getPackagesFromJsPath(workerData.jsPath);
		})
	}

	/**
	 *
	 * @param {RequestTask} requestTask
	 */
	static insertIntoQueue(requestTask)
	{
		const sourcecodeHash = requestTask.sourcecodeHash;
		if(requestTask.processType === "cpu")
		{
			if(typeof cpuTaskQueues[sourcecodeHash] === "undefined") cpuTaskQueues[sourcecodeHash] = [];
			cpuTaskQueues[sourcecodeHash].push(requestTask);
		}
		else
		{
			if(typeof gpuTaskQueues[sourcecodeHash] === "undefined") gpuTaskQueues[sourcecodeHash] = [];
			gpuTaskQueues[sourcecodeHash].push(requestTask);
		}
	}


	static getIncompleteTask(taskId)
	{
		return incompleteTasks[taskId];
	}

	static taskComplete(taskId)
	{
		const request = incompleteTasks[taskId];
		delete incompleteTasks[taskId];
		return request;
	}

	/** @return {Object<RequestTask[]>} */
	static get cpuTaskQueues() { return cpuTaskQueues; }

	/** @return {Object<RequestTask[]>} */
	static get gpuTaskQueues() { return gpuTaskQueues; }

	/**
	 *
	 * @param {string} sourcecodeHash
	 * @param {string} packageHash
	 * @param {function} resolve Promise の resolve
	 * @param {function} reject Promise の reject
	 * @param {object} workerData
	 * @param {string} processType
	 */
	constructor(sourcecodeHash, packageHash, resolve, reject, workerData, processType)
	{
		super();
		/** @type {string} */
		this.taskId = Date.now().toString(36) + Math.random().toString(36).slice(-2) + Math.random().toString(36).slice(-2);

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

		/** @type {NodeJS.Timeout} */
		this._timeoutCheckId = 0;

		/** @type {object} */
		this.workerData = workerData;

		/** @type {string} */
		this.processType = processType;

		incompleteTasks[this.taskId] = this;

		//todo: タイムアウト処理作ってない気がする
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

		return outbound;
	}

	statusUpdate()
	{
		timeoutStop(this);
		this._updatedAt = Date.now();
		this._timeoutCheckId = setTimeout(()=>
		{
			if(RagingSocketOptions.autoTimeoutTryAgain && this.autoTimeoutTryAgainCount++ > RagingSocketOptions.maxAutoTimeoutTryAgain)
			{
				this.tryAgain();
			}
			else
			{
				this.reject({status: "timeout", request: this});
			}
			this.emit("timeout");
			this._updatedAt = 0;
		}, RagingSocketOptions.requestTimeout);
	}

	assignCancel()
	{
		timeoutStop(this);
		delete sentTasks[this.sourcecodeHash][this.taskId];
	}

	markComplete()
	{
		delete incompleteTasks[this.taskId];
		delete sentTasks[this.sourcecodeHash][this.taskId];
	}

	tryAgain()
	{
		const sourcecodeHash = this.sourcecodeHash;
		const taskQueues = this.processType === "cpu" ? cpuTaskQueues : gpuTaskQueues;
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