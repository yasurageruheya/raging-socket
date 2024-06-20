const Pathurizer = require("./Pathurizer");
const Test = require("./Test");

new Test("Pathurizer Test 1", ()=>
	{
		return new Pathurizer("https://example.com/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment");
	},
	{
		directorySeparator: "/",
		protocol: "https",
		host: "example.com",
		port: "",
		root: "",
		trailing: "",
		directories: ["path", "to"],
		extension: "html",
		ignoreExtension: "file.org",
		params: {
			param1: "value.1",
			param2: "value#2",
			param3: "value3"
		},
		fragment: "fragment"
	});
new Test("Pathurizer Test 2", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment");
	},
	{
		directorySeparator: "/",
		protocol: "",
		host: "",
		port: "",
		root: "/",
		trailing: "",
		directories: ["path", "to"],
		extension: "html",
		ignoreExtension: "file.org",
		params: {
			param1: "value1",
			param2: "v#a#l#u#e2",
			param3: "value..3"
		},
		fragment: "fragment"
	});
new Test("Pathurizer Test 2.5", ()=>
	{
		return new Pathurizer("/path/to/folder/?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment");
	},
	{
		directorySeparator: "/",
		protocol: "",
		host: "",
		port: "",
		root: "/",
		trailing: "/",
		directories: ["path", "to", "folder"],
		extension: "",
		ignoreExtension: "",
		params: {
			param1: "value1",
			param2: "v#a#l#u#e2",
			param3: "value..3"
		},
		fragment: "fragment"
	});
new Test("Pathurizer Test 3", ()=>
	{
		return new Pathurizer("https://example.com:3000/");
	},
	{
		directorySeparator: "/",
		protocol: "https",
		host: "example.com",
		port: "3000",
		root: "",
		trailing: "/",
		directories: [],
		extension: "",
		ignoreExtension: "",
		params: {},
		fragment: ""
	});
new Test("Pathurizer Test 4", ()=>
	{
		return new Pathurizer("/path/to/the/file.org.html?param1=va:lue1&param2=v#a#l#u#e2");
	},
	{
		directorySeparator: "/",
		protocol: "",
		host: "",
		port: "",
		root: "/",
		trailing: "",
		directories: ["path", "to", "the"],
		extension: "html",
		ignoreExtension: "file.org",
		params: {
			param1: "va:lue1",
			param2: "v#a#l#u"
		},
		fragment: "e2"
	});
new Test("Pathurizer Test 5", ()=>
	{
		return new Pathurizer("/views/fonts/icf.ttf");
	},
	{
		directorySeparator: "/",
		protocol: "",
		host: "",
		port: "",
		root: "/",
		trailing: "",
		directories: ["views", "fonts"],
		extension: "ttf",
		ignoreExtension: "icf",
		params: {},
		fragment: ""
	});

new Test("Pathurizer Test 6", ()=>
	{
		return new Pathurizer("https://example.com/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment").url;
	},
	"https://example.com/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment");
new Test("Pathurizer Test 7", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment").url;
	},
	"/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment");
new Test("Pathurizer Test 8", ()=>
	{
		return new Pathurizer("https://example.com:3000/").url;
	},
	"https://example.com:3000/");
new Test("Pathurizer Test 9", ()=>
	{
		return new Pathurizer("/path/to/the/file.org.html?param1=va:lue1&param2=v#a#l#u#e2").url;
	},
	"/path/to/the/file.org.html?param1=va:lue1&param2=v#a#l#u#e2");
new Test("Pathurizer Test 10", ()=>
	{
		return new Pathurizer("/views/fonts/icf.ttf").url;
	},
	"/views/fonts/icf.ttf");

new Test("Pathurizer Test 11", ()=>
	{
		const a = new Pathurizer("https://example.com/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment");
		a.ignoreExtension = "file";
		return a.fileName;
	},
	"file.html");
new Test("Pathurizer Test 12", ()=>
	{
		const a = new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment");
		a.fileName = "file";
		return a.url;
	},
	"/path/to/file?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment");
new Test("Pathurizer Test 13", ()=>
	{
		const a = new Pathurizer("https://example.com:3000/file.org.html");
		a.extension = "exe";
		return a.url;
	},
	"https://example.com:3000/file.org.exe");

new Test("Pathurizer Test toHost 1", ()=>
	{
		return new Pathurizer("https://example.com:3000/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment").toHost;
	},
	"https://example.com");
new Test("Pathurizer Test toHost 2", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment").toHost;
	},
	"");

new Test("Pathurizer Test toPortNumber 1", ()=>
	{
		return new Pathurizer("https://example.com:3000/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment").toPortNumber;
	},
	"https://example.com:3000");
new Test("Pathurizer Test toPortNumber 2", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment").toPortNumber;
	},
	"");

new Test("Pathurizer Test toDirectories 1", ()=>
	{
		return new Pathurizer("https://example.com:3000/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment").toDirectories;
	},
	"https://example.com:3000/path/to");
new Test("Pathurizer Test toDirectories 2", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment").toDirectories;
	},
	"/path/to");

new Test("Pathurizer Test toFileName 1", ()=>
	{
		return new Pathurizer("https://example.com:3000/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment").toFileName;
	},
	"https://example.com:3000/path/to/file.org.html");
new Test("Pathurizer Test toFileName 2", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment").toFileName;
	},
	"/path/to/file.org.html");

new Test("Pathurizer Test toFileNameIgnoreExtension 1", ()=>
	{
		return new Pathurizer("https://example.com:3000/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment").toFileNameIgnoreExtension;
	},
	"https://example.com:3000/path/to/file.org");
new Test("Pathurizer Test toFileNameIgnoreExtension 2", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment").toFileNameIgnoreExtension;
	},
	"/path/to/file.org");

new Test("Pathurizer Test toParamsIgnoreFragment 1", ()=>
	{
		return new Pathurizer("https://example.com:3000/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment").toParamsIgnoreFragment;
	},
	"https://example.com:3000/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3");
new Test("Pathurizer Test toParamsIgnoreFragment 2", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment").toParamsIgnoreFragment;
	},
	"/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3");

new Test("Pathurizer Test toFragmentIgnoreParams 1", ()=>
	{
		return new Pathurizer("https://example.com:3000/path/to/file.org.html?param1=value.1&param2=value#2&param3=value3#fragment").toFragmentIgnoreParams;
	},
	"https://example.com:3000/path/to/file.org.html#fragment");
new Test("Pathurizer Test toFragmentIgnoreParams 2", ()=>
	{
		return new Pathurizer("/path/to/file.org.html?param1=value1&param2=v#a#l#u#e2&param3=value..3#fragment").toFragmentIgnoreParams;
	},
	"/path/to/file.org.html#fragment");

new Test("Pathurizer Test local path 1", ()=>
	{
		return new Pathurizer("D:\\html\\aobiji.ac.jp\\views\\css\\position.css").url;
	},
	"D:\\html\\aobiji.ac.jp\\views\\css\\position.css");

new Test("Pathurizer Test local path 1", ()=>
	{
		return new Pathurizer("D:\\html\\raging-socket\\.package-lock.json").url;
	},
	"D:\\html\\raging-socket\\.package-lock.json");

Test.run();

module.exports = Test;