/** @type {Object.<ToClientResponse>} */
const instances = [];

/** @type {typeof RagingSocket} */
let RagingSocket;

class ToClientResponse
{
	static initialize()
	{
		RagingSocket = require("./RagingSocket");
	}

	static getInstance(taskId, toClientSocket, taskName)
	{
		if(typeof instances[taskId] === "undefined") instances[taskId] = new ToClientResponse(taskId, toClientSocket, taskName);
		return instances[taskId];
	}

	/** @type {string} */
	#taskId;

	/** @type {string} */
	#taskName;

	/** @type {ToClientSocket} */
	toClientSocket;

	/**
	 *
	 * @param {string} taskId
	 * @param {ToClientSocket} toClientSocket
	 * @param {string} taskName
	 */
	constructor(taskId, toClientSocket, taskName)
	{
		this.#taskId = taskId;
		this.#taskName = taskName;
		this.toClientSocket = toClientSocket;

		instances.push(this);
	}

	get taskName() { return this.#taskName }

	get taskId() { return this.#taskId; }

	/**
	 *
	 * @param {*} data
	 * @return {Promise<ToClientResponse>}
	 */
	vars(data)
	{
		return this.toClientSocket.vars(this, data);
	}

	/**
	 *
	 * @param {Transferable} data
	 * @param {string} [dataName=""]
	 * @return {Promise<ToClientResponse>}
	 */
	transfer(data, dataName="")
	{
		return this.toClientSocket.transfer(this, data, dataName);
	}

	/**
	 *
	 * @return {Promise<FromClientProcessing|Error>}
	 */
	start()
	{
		return this.toClientSocket.start(this);
	}

}

module.exports = ToClientResponse;