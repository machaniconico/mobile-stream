package com.mobilelivecaster.streaming

import com.pedro.rtmp.rtmp.RtmpClient
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.Continuation
import kotlin.coroutines.intrinsics.COROUTINE_SUSPENDED
import kotlin.coroutines.intrinsics.suspendCoroutineUninterceptedOrReturn
import kotlinx.coroutines.runBlocking

internal object AndroidRtmpDisconnectAwaiter {
    private const val DISCONNECT_TIMEOUT_MILLIS = 5_000L

    private val disconnectMethod: Method by lazy(LazyThreadSafetyMode.PUBLICATION) {
        resolveRootEncoderAwaitedDisconnectMethod()
    }

    fun verifyContract() {
        disconnectMethod
    }

    fun disconnectAndAwait(client: RtmpClient) {
        // RootEncoder 2.5.4 launches its public disconnect in a detached coroutine.
        // Invoke the same suspend path so sender, socket, and connection jobs are all closed first.
        executeAndroidNativeOwnerWithinDeadline(
            ownerName = "RootEncoder RTMP disconnect",
            timeoutMillis = DISCONNECT_TIMEOUT_MILLIS
        ) {
            runBlocking {
                invokeReflectedSuspendMethod(
                    receiver = client,
                    method = disconnectMethod,
                    true
                )
            }
        }
    }
}

internal class AndroidNativeOwnerTimeoutException(message: String) : Exception(message)

internal fun executeAndroidNativeOwnerWithinDeadline(
    ownerName: String,
    timeoutMillis: Long,
    operation: () -> Unit
) {
    require(ownerName.isNotBlank()) { "Native owner name is required" }
    require(timeoutMillis > 0L) { "Native owner timeout must be positive" }
    val completed = CountDownLatch(1)
    val failure = AtomicReference<Throwable?>(null)
    val worker = Thread(
        {
            try {
                operation()
            } catch (error: Throwable) {
                failure.set(error)
            } finally {
                completed.countDown()
            }
        },
        "MLC-RTMP-Disconnect"
    ).apply {
        isDaemon = true
        start()
    }

    val finished = try {
        completed.await(timeoutMillis, TimeUnit.MILLISECONDS)
    } catch (error: InterruptedException) {
        worker.interrupt()
        Thread.currentThread().interrupt()
        throw error
    }
    if (!finished) {
        worker.interrupt()
        throw AndroidNativeOwnerTimeoutException("$ownerName exceeded ${timeoutMillis}ms")
    }
    failure.get()?.let { throw it }
}

internal fun resolveRootEncoderAwaitedDisconnectMethod(): Method =
    RtmpClient::class.java.getDeclaredMethod(
        "disconnect",
        Boolean::class.javaPrimitiveType!!,
        Continuation::class.java
    ).apply {
        isAccessible = true
    }

internal suspend fun invokeReflectedSuspendMethod(
    receiver: Any,
    method: Method,
    vararg arguments: Any?
) {
    suspendCoroutineUninterceptedOrReturn<Unit> { continuation ->
        val invocationArguments = arrayOfNulls<Any?>(arguments.size + 1)
        arguments.forEachIndexed { index, argument ->
            invocationArguments[index] = argument
        }
        invocationArguments[arguments.size] = continuation

        val result = try {
            method.invoke(receiver, *invocationArguments)
        } catch (error: InvocationTargetException) {
            throw error.targetException ?: error
        }

        when (result) {
            COROUTINE_SUSPENDED -> COROUTINE_SUSPENDED
            Unit -> Unit
            else -> throw IllegalStateException("Reflected suspend method returned an unexpected result")
        }
    }
}
