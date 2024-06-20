/*const path = require("path");
const oldRequireResolvePaths = require.resolve.paths("");
const customRequireResolvePaths = [path.join(process.cwd(), "node_modules"), ...oldRequireResolvePaths];
require.resolve.paths = (moduleName)=>
{
	return customRequireResolvePaths;
}*/;
/**
 *
 * @param {WorkerSub} subWorker
 */
module.exports = async(subWorker)=>
{
	require = subWorker.customRequire(require);
	const sharp = require("sharp")
	const buffer = Buffer.from(subWorker.transfers["beforeTrimImage"]);

	const {data:bitmap, info} = await sharp(buffer)
										.ensureAlpha()
										.raw()
										.toBuffer({resolveWithObject: true});

	const numChannels = info.channels;
	const beforeWidth = info.width;
	const beforeHeight = info.height;

	let left=0, top=0;
	const bitmapLength = bitmap.length;
	for(let i=0; i<bitmapLength; i+=4)
	{
		if(bitmap[i+3] !== 0)
		{
			top = (i / 4 / info.width) >> 0;
			break;
		}
	}

	let foundOpaque = false;
	for(let x=0; x<beforeWidth; x++)
	{
		for(let y=0; y<beforeHeight; y++)
		{
			if(bitmap[(y * beforeWidth * numChannels) + (x * numChannels) + 3] !== 0)
			{
				foundOpaque = true;
				break;
			}
		}
		if(foundOpaque)
		{
			left = x;
			break;
		}
	}

	const trimSetting = {
		left: left,
		top: top,
		width: info.width - left,
		height: info.height - top
	};
	const {data:LTTrimmedBitmap, info:LTTrimmedInfo} = await sharp(bitmap, {raw: info})
																.extract(trimSetting)
																.toBuffer({resolveWithObject: true});

	const afterWidth = LTTrimmedInfo.width;
	const afterHeight = LTTrimmedInfo.height;

	let right = afterWidth;
	foundOpaque = false;
	for(let x = afterWidth-1; x >= 0; x--)
	{
		for(let y= 0; y < afterHeight; y++)
		{
			if(LTTrimmedBitmap[(y * afterWidth * numChannels) + (x * numChannels) + 3] !== 0)
			{
				foundOpaque = true;
				break;
			}
		}
		if(foundOpaque)
		{
			right = x;
			break;
		}
	}

	let bottom = afterHeight;
	for(let i=LTTrimmedBitmap.length-4; i >=0; i -= 4)
	{
		if(LTTrimmedBitmap[i + 3] !== 0)
		{
			bottom = (i / (afterWidth * 4)) >> 0;
			break;
		}
	}

	trimSetting.left = 0;
	trimSetting.top = 0;
	trimSetting.width = right;
	trimSetting.height = bottom;

	const {data:trimmedBitmap, info:trimmedInfo} = await sharp(LTTrimmedBitmap, {raw: LTTrimmedInfo})
															.extract(trimSetting)
															.toBuffer({resolveWithObject:true});

	const rect = {};
	rect.left = beforeWidth - afterWidth;
	rect.top = beforeHeight - afterHeight;
	rect.width = trimmedInfo.width;
	rect.height = trimmedInfo.height;
	subWorker.sendToMainWorker.vars({rect:rect, info:trimmedInfo});
	subWorker.processFinish(trimmedBitmap.buffer);
}