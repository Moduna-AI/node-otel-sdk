import {
	registerConfigureHook,
	setContextVariable,
} from "@langchain/core/context";
import type { ModunaLangChainCallbackHandler } from "@/services/ModunaLangChainCallbackHandler.js";

const MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY =
	"moduna.otel.langchain.callbackHandler";

let isConfigureHookRegistered = false;

/**
 * Registers a Moduna LangChain callback handler for all LangChain runs.
 *
 * @param handler Handler to register globally.
 */
export const registerGlobalModunaLangChainHandler = (
	handler: ModunaLangChainCallbackHandler,
): void => {
	if (!isConfigureHookRegistered) {
		registerConfigureHook({
			contextVar: MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY,
			inheritable: true,
		});
		isConfigureHookRegistered = true;
	}

	setContextVariable(MODUNA_LANGCHAIN_HANDLER_CONTEXT_KEY, handler);
};
