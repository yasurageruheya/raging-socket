const RagingSocketOptions = require("./RagingSocketOptions");
const RagingSocket = require("./RagingSocket");
const EventEmitter = require("events");
const {time} = require("systeminformation");

/** @type {Object.<RequestTask>} */
const incompleteTasks = {};

/** @type {Object.<RequestTask[]>} */
const cpuTaskQueues = {};

/** @type {Object.<RequestTask[]>} */
const gpuTaskQueues = {};

/** @type {Object.<RequestTask[]>} */
const sentTasks = {};

/** @type {PackageManager} */
let packageManager;

class RequestTask extends EventEmitter
{
	static initialize()
	{
		packageManager = RagingSocket.manager;
	}

	/**
	 *
	 * @param {string} sourcecode
	 * @param {object} workerData
	 * @param {function} promiseResolve
	 * @param {string} processType
	 */
	static queue(sourcecode, workerData, promiseResolve, processType)
	{
		const sourcecodeHash = packageManager.getSourcecodeHashFromSourcecode(sourcecode);
		const task = new RequestTask(sourcecodeHash, promiseResolve, workerData, processType);
		RequestTask.insertIntoQueue(task);
		task.promise.requiredPackages = packageManager.getPackagesFromSourcecode(sourcecode);
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

	static get cpuTaskQueues() { return cpuTaskQueues; }

	static get gpuTaskQueues() { return gpuTaskQueues; }

	/**
	 *
	 * @param {string} sourcecodeHash
	 * @param {function} resolve Promise の resolve
	 * @param {object} workerData
	 * @param {string} processType
	 */
	constructor(sourcecodeHash, resolve, workerData, processType)
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

		/** @type {string|null} */
		this.packageHash = "";

		this.resolve = resolve;

		/** @type {number} */
		this._updatedAt = 0;

		/** @type {number} */
		this._timeoutCheckId = 0;

		/** @type {object} */
		this.workerData = workerData;

		/** @type {string} */
		this.processType = processType;

		incompleteTasks[this.taskId] = this;
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
		delete outbound.workerData;

		return outbound;
	}

	statusUpdate()
	{
		timeoutStop();
		this._updatedAt = Date.now();
		this._timeoutCheckId = setTimeout(()=>
		{
			this.emit("timeout");
			this._updatedAt = 0;
		}, RagingSocketOptions.requestTimeout);
	}

	assignCancel()
	{
		timeoutStop();
		delete sentTasks[this.sourcecodeHash][this.taskId];
	}

	markComplete()
	{
		delete incompleteTasks[this.taskId];
		delete sentTasks[this.sourcecodeHash][this.taskId];
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
		if(typeof request[key] === "object" && Object.keys(request[key]).length)
		{
			outbound[key] = request[key];
		}
		else if(this[key])
		{
			outbound[key] = request[key];
		}
	}

	return outbound;
}

module.exports = RequestTask;