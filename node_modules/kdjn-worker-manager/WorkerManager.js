/** @type {WorkerMain[]} */
const working = [];
/** @type {WorkerMain[]} */
const waiting = [];
/** @type {Object.<number>} */
const jsPathCache = {};
/** @type {string[]} */
const queue = [];

const {EventEmitter} = require("events");

const presenter = new EventEmitter();

class WorkerManager
{
	static workerLimit = require("os").cpus().length;

	static get require() { return require; }

	/** @return {boolean} */
	static logOutput = false;

	/**
	 *
	 * @param workerData
	 * @return {Promise<WorkerMain>}
	 */
	static assign(workerData)
	{
		if(typeof workerData.jsPath === "undefined")
			throw new Error("WorkerManager.assign() の引数に入れるオブジェクトの中に jsPath プロパティ（サブスレッドが require するための js ファイルまでの絶対パス）が必要です");

		const jsPath = workerData.jsPath;

		if(typeof jsPathCache[jsPath] === "undefined")
		{
			const func = require(jsPath);
			if(typeof func !== "function")
			{
				throw new Error("WorkerManager.assign に渡す workerData.jsPath プロパティの js ファイルまでのファイルパスは、module.exports に関数を渡している js ファイルのみ受け付けられます");
			}
			const code = func.toString();
			if(code.lastIndexOf(".processFinish(") < 0)
			{
				throw new Error("WorkerSub インスタンスに実行させるコードの中に、処理の終了をメインスレッドに知らせるための processFinish メソッドを実行する箇所が存在していないようです");
			}
			jsPathCache[jsPath] = 1;
		}

		const sendSubWorkerData = Object.assign({}, workerData);
		sendSubWorkerData.jsPath = jsPath;
		sendSubWorkerData.___log = WorkerManager.logOutput;

		return new Promise(resolve =>
		{
			searchWorker(resolve, sendSubWorkerData);
		});
	}

	constructor(workerData)
	{

	}
}

const searchWorker=(resolve, sendSubWorkerData)=>
{
	const jsPath = sendSubWorkerData.jsPath;
	if(working.length < WorkerManager.workerLimit)
	{
		let i = waiting.length;
		if(i > 0)
		{
			while (i--)
			{
				if(typeof waiting[i].modules[jsPath] !== "undefined") break;
			}

			/** @type {WorkerMain} */
			const workerMain = (()=>
			{
				if(i >= 0) return waiting.splice(i, 1)[0];
				else return waiting.pop();
			})();

			workerMain.sendWorkerData(sendSubWorkerData);
			initializeWorker(resolve, workerMain);
		}
		else
		{
			initializeWorker(resolve, new WorkerMain(sendSubWorkerData));
		}
	}
	else
	{
		const queueName = Math.random().toString(36).slice(2);
		queue.push(queueName);
		presenter.once(queueName, ()=>
		{
			searchWorker(resolve, sendSubWorkerData);
		});
	}
}

/**
 *
 * @param resolve
 * @param {WorkerMain} workerMain
 */
const initializeWorker = (resolve, workerMain)=>
{
	for(const eventName of WorkerMain.events)
	{
		workerMain.removeAllListeners(eventName);
	}
	workerMain.once("end", ()=>
	{
		const indexOf = working.indexOf(workerMain);
		waiting.push(working.splice(indexOf, 1)[0]);
		if(queue.length)
		{
			const queueName = queue.shift();
			presenter.emit(queueName);
		}
	});
	working.push(workerMain);
	resolve(workerMain);
}

module.exports = WorkerManager;

const WorkerMain = require("./WorkerMain");