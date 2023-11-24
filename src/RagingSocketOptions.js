const RagingSocketOptions = {};

RagingSocketOptions.socketPort = 30001;
RagingSocketOptions.requestTimeout = 30000;
RagingSocketOptions.autoRequestTryAgain = false;


RagingSocketOptions.toServerSocketOptions = {};
RagingSocketOptions.toServerSocketOptions.reconnection = false;


module.exports = RagingSocketOptions;