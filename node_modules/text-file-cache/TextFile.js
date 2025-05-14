const fs = require("fs");
const memories = {};
const EventEmitter = require("events");

class TextFile extends EventEmitter
{
	/**
	 * @event TextFile.complete
	 * @param {TextFile} textFile
	 */
	/**
	 * @event TextFile.error
	 * @param {TextFile} textFile
	 * @param {Error} error
	 */
	/**
	 *
	 * @param {string} filePath
	 * @fires TextFile.complete
	 * @fires TextFile.error
	 */
	constructor(filePath)
	{
		super();

		/** @type {Date} */
		this.updatedAt = null;

		/** @type {string} */
		this.filePath = filePath;

		/** @type {Date} @private */
		this._prevCheckDate = null;

		/** @type {boolean} */
		this._isRecheckTimeout = true;

		/** @type {number} */
		this.cacheTimeout = 1000;

		/** @type {string|*} */
		this.encoding = "utf-8";

		/** @type {string|Buffer} @private */
		this._content = fs.readFileSync(filePath, this.encoding);


		this._getPromise = null;

		/** @type {boolean} @private */
		this._isWriting = false;
	}

	/**
	 *
	 * @return {Promise<string>}
	 */
	get content()
	{
		if(!this._getPromise)
		{
			this._getPromise = new Promise((resolve, reject)=>
			{
				fs.stat(this.filePath, (error, stats)=>
				{
					if(error) return reject(error);

					const mtime = stats.mtime;
					if(this.updatedAt < mtime)
					{
						this.updatedAt = mtime;
						fs.readFile(this.filePath, this.encoding, (error, content)=>
						{
							this._content = content;
							resolve(this._content);
						})
					}
					else resolve(this._content);
				})
			});

			setTimeout(()=>
			{
				this._getPromise = null;
			}, this.cacheTimeout);
		}

		return this._getPromise;
	}

	/**
	 *
	 * @param {string} value
	 */
	set content(value)
	{
		this._content = value;
		this.updatedAt = this._prevCheckDate = new Date;
		if(!this._isWriting)
		{
			this._getPromise = new Promise(resolve=>resolve(value));
			this._isWriting = true;
			const writeData = this._content;
			fs.writeFile(this.filePath, writeData, this.encoding, ((error)=>
			{
				if(error) this.emit("error", this, error);

				this._isWriting = false;
				if(writeData !== this._content)
				{
					console.log("rewrite");
					this.content = this._content;
				}
				else
				{
					this.updatedAt = fs.statSync(this.filePath).mtime;
					this.emit("complete", this);
				}
			}));
		}
	}

	/** @type {TextFile} */
	static getTextFile(filePath)
	{
		if(memories[filePath]) return memories[filePath];

		const m = new TextFile(filePath);
		memories[filePath] = m;
		return m;
	}

	get isExist()
	{
		return fs.existsSync(this.filePath);
	}

	get isWriting()
	{
		return this._isWriting;
	}
}

module.exports = TextFile;