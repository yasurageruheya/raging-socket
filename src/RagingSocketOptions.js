/** @type {typeof WorkerManager} */
let WorkerManager;

class RagingSocketLogOptions {
	constructor() {
		/**
		 * クライアント、サーバー双方の送受信に関するログを全て console に出力する場合、true にしてください。相当量のログになるため高負荷です。
		 * @type {boolean}
		 */
		this.connectionInfo = false;

		/**
		 * クライアントから送られてくる Buffer と、サーバーが受け取る Buffer が合っているかどうか確認が必要な場合 true にしてください。
		 * console に送信 Buffer と、受信 Buffer のハッシュ値を出力しますが、クライアント、サーバー両方でハッシュ関数を実行するため高負荷です。
		 * @type {boolean}
		 */
		this.bufferHashCheck = false;

		/**
		 *
		 * @type {boolean}
		 */
		this.showStatusReport = false;

		/**
		 * クライアントから現在のCPU使用率や依頼済みのプロセス数が送られてくる度に、console に内容を出力したい場合、true にしてください。
		 * @type {boolean}
		 */
		this.showClientStatusReport = false;

		/**
		 * クライアントへのタスク要求や応答など、タスクに関する通信処理がどのタイミングで行われているかを console に出力し追跡したい場合 1 以上の数値を指定してください。 数値が高いほど詳細なログが出力されます。
		 * @type {number}
		 */
		this.taskTraceLevel = 0;

		/**
		 * 残りのタスクをログに出力します
		 * @type {boolean}
		 */
		this.showIncompleteTasks = false;
	}

	/**
	 * クライアントの Worker の処理に関するログを console に出力する場合は true にしてください。
	 * @return {boolean}
	 */
	get workerLog() { return WorkerManager.logOutput; }

	set workerLog(bool) { WorkerManager.logOutput = bool; }

	getLogOutputStatus() {
		return {
			connectionInfo: this.connectionInfo,
			workerLog: this.workerLog,
			bufferHashCheck: this.bufferHashCheck,
			showClientStatusReport: this.showClientStatusReport,
			taskTraceLevel: this.taskTraceLevel
		}
	}
}

const Directory = require("./Directory");

class RagingSocketOptions
{
	static socketPort = 30001;
	static requestTimeout = 30000;
	static autoRequestTryAgain = false;
	static maxAutoRequestTryAgain = 10;
	static autoTimeoutTryAgain = false;
	static maxAutoTimeoutTryAgain = 10;
	static statusReportCooldownTime = 50;
	static reclaimStatusReportTime = 100;
	static offlineDetectionTimeLimit = 1000 * 60;

	static get bufferCacheDirectory() { return Directory.bufferCacheDirectory; }
	static set bufferCacheDirectory(value) { Directory.bufferCacheDirectory = value; }

	static bufferCacheMemoryTTL = 10_000;
	static bufferCacheFileTTL = 600_000;

	static logOptions = new RagingSocketLogOptions();

	static toServerSocketOptions = {
		reconnection: true,
		reconnectionDelay: 5000
	};

	static projectScopeRootPath = process.cwd();

	static name = "";

	static initialize()
	{
		WorkerManager = require("./RagingSocket").workerManager;
	}
}



module.exports = RagingSocketOptions;