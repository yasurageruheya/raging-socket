

class RagingSocketError
{
	static getTimeLimitedFileCacheTTLError(bufferHash)
	{
		return new Error("ハッシュ値: " + bufferHash + " のバイナリキャッシュが見つかりませんでした。RagingSocket.options.bufferCacheDirectory に有効なディレクトリまでのパスが記載されていない、もしくは正しくパスが設定されていても RagingSocket.options.bufferCacheMemoryTTL もしくは RagingSocket.options.bufferCacheFileTTL のキャッシュ期間が短すぎる可能性があります")
	}

	constructor(){}
}

module.exports = RagingSocketError;