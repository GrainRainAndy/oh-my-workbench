// Created only by the host before a request reaches a plugin worker.
class NotDispatched extends Error {}
class ConfirmedCancellation extends Error {}
module.exports={NotDispatched,ConfirmedCancellation};
