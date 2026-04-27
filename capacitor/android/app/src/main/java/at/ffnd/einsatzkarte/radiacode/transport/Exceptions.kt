package at.ffnd.einsatzkarte.radiacode.transport

open class TransportException(message: String, cause: Throwable? = null) :
    Exception(message, cause)

class DeviceNotFound(message: String, cause: Throwable? = null) :
    TransportException(message, cause)

class ConnectionClosed(message: String, cause: Throwable? = null) :
    TransportException(message, cause)

class TransportTimeout(message: String) : TransportException(message)
