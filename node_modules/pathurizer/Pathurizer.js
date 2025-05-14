class Pathurizer
{
	/**
	 *
	 * @param {string} url
	 * @param {string} [directorySeparator=""]
	 * @return {Pathurizer}
	 */
	static parse(url, directorySeparator="")
	{
		return new Pathurizer(url, directorySeparator);
	}

	/**
	 *
	 * @param {string} url
	 * @param {string} [directorySeparator=""]
	 * @return {Pathurizer}
	 */
	constructor(url, directorySeparator="")
	{
		/** @type {"\\"|"/"|""} */
		this.directorySeparator = directorySeparator;

		if(!directorySeparator)
		{
			const slashIndex = url.indexOf("/");
			const backslashIndex = url.indexOf("\\");
			if(slashIndex >= 0 && backslashIndex < 0) this.directorySeparator = "/";
			else if(slashIndex < 0 && backslashIndex >= 0) this.directorySeparator = "\\";

			directorySeparator = this.directorySeparator;
		}

		/**
		 * http とか https とか。 url にプロトコルが含まれていなければ ""(空文字列）が入ります
		 * @type {string}
		 */
		this.protocol = "";

		/**
		 * ホスト名（ドメイン名）<br>
		 * url が "https://example.com/path/to/file.org.html" だったら
		 * "example.com" の部分
		 * @type {string}
		 */
		this.host = "";

		/**
		 * url にポート番号が含まれている場合、そのポート番号が文字列で格納されています。<br>
		 * url が "https://example.com:3000/path/to/file.org.html" だったら
		 * "3000"部分
		 * @type {string}
		 */
		this.port = "";

		/**
		 * url の最初が "/" であれば "/" が入ります。
		 * @type {string}
		 */
		this.root = "";

		/**
		 * トレイリングスラッシュ（URL末尾のスラッシュ）があれば "/" が入ります。
		 * @type {string}
		 */
		this.trailing = "";

		/**
		 * url 内のディレクトリ名部分が配列で入ってます。<br>
		 * url が "https://example.com/path/to/file.org.html" だったら
		 * ["path", "to"] という形<br>
		 * url が "https://example.com/path/to/file" の時でも
		 * ["path", "to"] という形
		 * @type {string[]}
		 */
		this.directories = [];

		/**
		 * url 内に拡張子がある場合、拡張子が格納されます。なければ ""(空文字列)が入ります。<br>
		 * url が "/path/to/file.org.html?param1=value.1&param2=value#2" だったら
		 * "html" の部分<br>
		 * url が "/path/to/file" だったら
		 * ignoreExtension と fileName が "file" で、extension は ""(空文字列)<br>
		 * @type {string}<br>
		 */
		this.extension = "";

		/**
		 * url にファイル名がある場合、拡張子を除いたファイル名が格納されています。<br>
		 * url が "/path/to/file.org.html?param1=value.1&param2=value#2" だったら
		 * "file.org" の部分
		 * @type {string}
		 */
		this.ignoreExtension = "";

		/**
		 * url に GET パラメーターがある場合、各パラメーターを key:value の形で格納されています。<br>
		 * url が "/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment" だったら
		 * {
		 *     param1: "value1",
		 *     param2: "v#a#l#u#e2",
		 *     param3: "value..3"
		 * } というオブジェクトが入ってるはず
		 * @type {Object.<String>}
		 */
		this.params = {};

		/**
		 * url にフラグメント拡張子(#)が含まれる場合、フラグメント拡張子を格納されています。<br>
		 * url が "/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment" だったら
		 * "fragment" の部分が入るはず
		 * @type {string}
		 */
		this.fragment = "";

		const hashIndex = url.lastIndexOf("#");
		const queryIndex = url.indexOf("?");
		let query = "";
		let hash = "";
		if (hashIndex >= 0) {
			hash = url.substring(hashIndex + 1);
			url = url.substring(0, hashIndex);
		}
		if (queryIndex >= 0) {
			query = url.substring(queryIndex + 1);
			url = url.substring(0, queryIndex);
		}

		if(url.charAt(url.length-1) === directorySeparator) this.trailing = directorySeparator;

		// スキームを取得する
		const schemeIndex = url.indexOf("://");
		if (schemeIndex >= 0) {
			this.protocol = url.substring(0, schemeIndex);
			url = url.substring(schemeIndex + 3);
		}

		// ポート番号を取得する
		const portIndex = url.indexOf(":", 2);
		const slashIndex = url.indexOf(directorySeparator);
		if (portIndex >= 0 && (slashIndex < 0 || portIndex < slashIndex)) {
			this.host = url.substring(0, portIndex);
			this.port = url.substring(portIndex + 1, slashIndex);
			url = url.substring(slashIndex + 1);
		} else if (slashIndex >= 0) {
			if(slashIndex > 0) this.host = url.substring(0, slashIndex);
			else this.root = url.substring(0, 1);
			url = url.substring(slashIndex + 1);
		} else {
			this.host = url;
			url = "";
		}

		// ディレクトリとファイル名を取得する
		const pathSegments = url.split(directorySeparator);
		this.fileName = pathSegments.pop();
		this.directories = this.directories.concat(pathSegments.filter((segment) => segment.length > 0));

		// クエリストリングをパースする
		const paramPairs = (query.length > 0) ? query.split("&") : [];
		for (let i = 0; i < paramPairs.length; i++) {
			const pair = paramPairs[i].split("=");
			if (pair.length === 2) {
				this.params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
			} else if (pair.length === 1) {
				this.params[decodeURIComponent(pair[0])] = "";
			}
		}

		// フラグメントをセットする
		this.fragment = decodeURIComponent(hash);
	}

	/**
	 * url 内のファイル名部分が格納されています。<br>
	 * url が "/path/to/file.org.html?param1=value.1&param2=value#2" だったら
	 * "file.org.html" の部分<br>
	 * url が "https://example.com/" だったら
	 * ""(空文字列)<br>
	 * url が "/path/to/file" だったら
	 * "file"
	 * @return {string}
	 */
	get fileName() { return this.ignoreExtension + (this.extension ? "." + this.extension : ""); }
	set fileName(value)
	{
		const dotIndex = value.lastIndexOf(".");
		if(dotIndex >= 0)
		{
			this.ignoreExtension = value.substring(0, dotIndex);
			this.extension = value.substring(dotIndex + 1);
		}
		else
		{
			this.ignoreExtension = value;
			this.extension = "";
		}
	}

	get toHost()
	{
		return (this.protocol ? this.protocol + ":" + this.directorySeparator + this.directorySeparator : "") + this.host;
	}

	get toDomain() { return this.toHost; }

	get toPortNumber()
	{
		return (this.protocol ? this.protocol + "://" : "") +
			this.host + (this.port ? ":" + this.port : "");
	}

	get toDirectories()
	{
		const sep = this.directorySeparator;
		return (this.protocol ? this.protocol + "://" : "") +
			this.host + (this.port ? ":" + this.port : "") + this.root +
			(this.directories.length ? (this.host ? sep : "") + this.directories.join(sep) : "") +
			this.trailing;
	}

	get toFileName()
	{
		const sep = this.directorySeparator;
		return (this.protocol ? this.protocol + "://" : "") +
			this.host + (this.port ? ":" + this.port : "") + this.root +
			(this.directories.length ? (this.host ? sep : "") + this.directories.join(sep) : "") +
			(this.fileName ? (this.directories.length || this.host ? sep : "") + this.fileName : "") +
			this.trailing;
	}

	get toFileNameIgnoreExtension()
	{
		const sep = this.directorySeparator;
		return (this.protocol ? this.protocol + "://" : "") +
			this.host + (this.port ? ":" + this.port : "") + this.root +
			(this.directories.length ? (this.host ? sep : "") + this.directories.join(sep) : "") +
			(this.ignoreExtension ? (this.directories.length || this.host ? sep : "") + this.ignoreExtension : "") +
			this.trailing;
	}

	get toExtension() { return this.toFileName; }

	get toParamsIgnoreFragment()
	{
		const sep = this.directorySeparator;
		return (this.protocol ? this.protocol + "://" : "") +
			this.host + (this.port ? ":" + this.port : "") + this.root +
			(this.directories.length ? (this.host ? sep : "") + this.directories.join(sep) : "") +
			(this.fileName ? (this.directories.length || this.host ? sep : "") + this.fileName : "") +
			this.trailing + (Object.keys(this.params).length ? "?" + (()=>
			{
				let str = "";
				for(const key in this.params)
				{
					str += key + "=" + this.params[key] + "&";
				}
				str = str.slice(0, -1);
				return str;
			})() : "");
	}

	get toFragmentIgnoreParams()
	{
		const sep = this.directorySeparator;
		return (this.protocol ? this.protocol + "://" : "") +
			this.host + (this.port ? ":" + this.port : "") + this.root +
			(this.directories.length ? (this.host ? sep : "") + this.directories.join(sep) : "") +
			(this.fileName ? (this.directories.length || this.host ? sep : "") + this.fileName : "") +
			this.trailing + (this.fragment ? "#" + this.fragment : "");
	}

	/**
	 * url の内容を全て繋げた物を取得できます。
	 * @return {string}
	 */
	get url()
	{
		const sep = this.directorySeparator;
		return (this.protocol ? this.protocol + "://" : "") +
			this.host + (this.port ? ":" + this.port : "") + this.root +
			(this.directories.length ? (this.host ? sep : "") + this.directories.join(sep) : "") +
			(this.fileName ? (this.directories.length || this.host ? sep : "") + this.fileName : "") +
			this.trailing + (Object.keys(this.params).length ? "?" + (()=>
			{
				let str = "";
				for(const key in this.params)
				{
					str += key + "=" + this.params[key] + "&";
				}
				str = str.slice(0, -1);
				return str;
			})() : "") + (this.fragment ? "#" + this.fragment : "");
	}

	/**
	 * ホスト名（ドメイン名）
	 * url が "https://example.com/path/to/file.org.html" だったら
	 * "example.com" の部分
	 * @return {string}
	 * @see Pathurizer#host
	 */
	get domain() { return this.host; }
	set domain(value) { this.host = value; }

	/**
	 *
	 * @return {Pathurizer}
	 */
	clone()
	{
		return new Pathurizer(this.url, this.directorySeparator);
	}
}


module.exports = Pathurizer;