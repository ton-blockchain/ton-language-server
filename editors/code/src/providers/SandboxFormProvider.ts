//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {ContractAbi} from "@shared/abi"

export interface FormData {
    readonly sendContract?: string
    readonly getContract?: string
    readonly messageType?: "raw" | "structured"
    readonly rawMessage?: string
    readonly selectedMessage?: string
    readonly messageFields?: Record<string, string>
    readonly value?: string
    readonly methodId?: string
    readonly selectedMethod?: string
    readonly storageFields?: Record<string, string>
}

export class SandboxFormProvider implements vscode.WebviewViewProvider {
    public static readonly viewType: string = "tonSandboxForm"

    private _view?: vscode.WebviewView
    private _formData: FormData = {}
    public _deployedContracts: {address: string; name: string; abi?: ContractAbi}[] = []

    private readonly _onDidChangeFormData: vscode.EventEmitter<FormData> =
        new vscode.EventEmitter<FormData>()

    public constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this._view = webviewView

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        }

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

        webviewView.webview.onDidReceiveMessage((data: {type: string; formData: FormData}) => {
            switch (data.type) {
                case "formDataChanged": {
                    this._formData = {...this._formData, ...data.formData}
                    this._onDidChangeFormData.fire(this._formData)
                    break
                }
                case "sendMessage": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.sendMessageFromForm",
                        this._formData,
                    )
                    break
                }
                case "callGetMethod": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.callGetMethodFromForm",
                        this._formData,
                    )
                    break
                }
                case "loadAbiForDeploy": {
                    void vscode.commands.executeCommand("ton.sandbox.loadAbiForDeploy")
                    break
                }
                case "compileAndDeploy": {
                    void vscode.commands.executeCommand("ton.sandbox.compileAndDeploy")
                    break
                }
            }
        })
    }

    public updateContracts(contracts: {address: string; name: string; abi?: ContractAbi}[]): void {
        this._deployedContracts = contracts
        if (this._view) {
            void this._view.webview.postMessage({
                type: "updateContracts",
                contracts: this._deployedContracts,
            })
        }
    }

    public getFormData(): FormData {
        return {...this._formData}
    }

    public updateFormData(data: Partial<FormData>): void {
        this._formData = {...this._formData, ...data}
        if (this._view) {
            void this._view.webview.postMessage({
                type: "updateFormData",
                formData: this._formData,
            })
        }
    }

    public showResult(
        result: {
            success: boolean
            message: string
            details?: string
        },
        resultId?: string,
    ): void {
        if (this._view) {
            void this._view.webview.postMessage({
                type: "showResult",
                result,
                resultId,
            })
        }
    }

    public openOperation(operation: string, contractAddress?: string): void {
        if (this._view) {
            void this._view.webview.postMessage({
                type: "openOperation",
                operation,
                contractAddress,
            })
        }
    }

    public updateStorageFields(abi: ContractAbi): void {
        if (this._view) {
            void this._view.webview.postMessage({
                type: "updateStorageFields",
                abi,
            })
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<!--suppress ALL -->
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sandbox Operations</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 0;
        }

        .operation-section {
            border-bottom: 1px solid var(--vscode-sideBar-border);
        }

        .operation-header {
            padding: 8px 12px;
            background-color: var(--vscode-sideBar-background);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-sideBarSectionHeader-foreground);
            border: none;
            width: 100%;
            text-align: left;
        }

        .operation-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .operation-header.active {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .chevron {
            transition: transform 0.2s ease;
        }

        .chevron.expanded {
            transform: rotate(90deg);
        }

        .operation-content {
            padding: 12px;
            display: none;
            background-color: var(--vscode-sideBar-background);
        }

        .operation-content.expanded {
            display: block;
        }

        .form-group {
            margin-bottom: 12px;
        }

        label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-input-foreground);
        }

        input, select, textarea {
            width: 100%;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-family: inherit;
            font-size: 12px;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        input:disabled, select:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            background-color: var(--vscode-input-background);
        }

        input[readonly] {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            cursor: default;
        }

        textarea {
            min-height: 60px;
            resize: vertical;
            font-family: var(--vscode-editor-font-family);
        }

        button {
            width: 100%;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-family: inherit;
            font-size: 12px;
            font-weight: 500;
            margin-top: 8px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .message-type-selector {
            display: flex;
            gap: 4px;
            margin-bottom: 8px;
        }

        .message-type-button {
            flex: 1;
            padding: 4px 8px;
            font-size: 11px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            cursor: pointer;
            margin-top: 0;
        }

        .message-type-button.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .result {
            margin-top: 12px;
            padding: 8px;
            border-radius: 3px;
            font-size: 11px;
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            display: none;
        }

        .result.success {
            background-color: rgba(22, 163, 74, 0.1);
            border: 1px solid rgba(22, 163, 74, 0.3);
            color: var(--vscode-foreground);
        }

        .result.error {
            background-color: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: var(--vscode-foreground);
        }

        .hidden {
            display: none;
        }

        .no-contracts {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 12px;
            font-style: italic;
        }

        .icon {
            margin-right: 6px;
        }

        .raw-message-details {
            margin-bottom: 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
        }

        .raw-message-details summary {
            padding: 8px 12px;
            cursor: pointer;
            background-color: var(--vscode-input-background);
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-descriptionForeground);
        }

        .raw-message-details summary:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .raw-message-details[open] summary {
            border-bottom: 1px solid var(--vscode-input-border);
        }

        .raw-message-details .form-group {
            margin: 12px;
            margin-bottom: 0;
        }

        .message-field {
            margin-bottom: 10px;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background-color: var(--vscode-editor-background);
        }

        .message-field-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }

        .message-field-name {
            font-weight: 500;
            font-size: 12px;
        }

        .message-field-type {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
        }

        .message-field input {
            margin-bottom: 0;
        }

        .no-messages {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 12px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div id="noContractsMessage" class="no-contracts">
        No contracts deployed yet.<br>
        Deploy a contract first to use operations.
    </div>

    <!-- Compile & Deploy -->
    <div class="operation-section">
        <button class="operation-header" data-operation="compile-deploy">
            <span><span class="icon">🚀</span>Compile & Deploy</span>
            <span class="chevron">▶</span>
        </button>
        <div class="operation-content" id="compile-deploy-content">
            <div class="form-group">
                <label>Deploy contract from active editor</label>
                <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px;">
                    Opens the active Tolk file, compiles it, and deploys to sandbox
                </p>
            </div>

            <div id="storageFieldsContainer"></div>

            <button id="compileDeployBtn">Compile & Deploy from Editor</button>
            <div id="compile-deploy-result" class="result"></div>
        </div>
    </div>

    <!-- Send Message -->
    <div class="operation-section">
        <button class="operation-header" data-operation="send-message">
            <span><span class="icon">📤</span>Send Message</span>
            <span class="chevron">▶</span>
        </button>
        <div class="operation-content" id="send-message-content">
            <div class="form-group">
                <label for="sendContractSelect">Target Contract:</label>
                <select id="sendContractSelect">
                    <option value="">Select contract...</option>
                </select>
            </div>

            <div id="structuredMessageFields">
                <div class="form-group">
                    <label for="messageSelect">Message:</label>
                    <select id="messageSelect">
                        <option value="">Select message...</option>
                    </select>
                </div>

                <div id="messageFieldsContainer"></div>
            </div>

            <details class="raw-message-details">
                <summary>Raw Message (Advanced)</summary>
                <div class="form-group">
                    <label for="rawMessage">Message (base64 Cell):</label>
                    <textarea id="rawMessage" placeholder="te6ccgEBAQEAAgAAAA=="></textarea>
                </div>
            </details>

            <div class="form-group">
                <label for="sendValue">Value (TON):</label>
                <input type="text" id="sendValue" placeholder="1.0" value="1.0">
            </div>

            <button id="sendMessageBtn">Send Message</button>
            <div id="send-message-result" class="result"></div>
        </div>
    </div>

    <!-- Call Get Method -->
    <div class="operation-section">
        <button class="operation-header" data-operation="get-method">
            <span><span class="icon">📞</span>Call Get Method</span>
            <span class="chevron">▶</span>
        </button>
        <div class="operation-content" id="get-method-content">
            <div class="form-group">
                <label for="getContractSelect">Target Contract:</label>
                <select id="getContractSelect">
                    <option value="">Select contract...</option>
                </select>
            </div>

            <div class="form-group">
                <label for="methodSelect">Get Method:</label>
                <select id="methodSelect">
                    <option value="">Select method...</option>
                </select>
            </div>

            <div class="form-group">
                <label for="methodId">Method ID:</label>
                <input type="number" id="methodId" placeholder="0" value="0" readonly>
            </div>

            <button id="callGetMethodBtn">Call Get Method</button>
            <div id="get-method-result" class="result"></div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let formData = {};
        let deployedContracts = [];
        let activeOperation = null;

        const noContractsMessage = document.getElementById('noContractsMessage');
        const operationHeaders = document.querySelectorAll('.operation-header');
        const sendContractSelect = document.getElementById('sendContractSelect');
        const getContractSelect = document.getElementById('getContractSelect');
        const methodSelect = document.getElementById('methodSelect');
        const messageSelect = document.getElementById('messageSelect');
        const messageFieldsContainer = document.getElementById('messageFieldsContainer');
        const storageFieldsContainer = document.getElementById('storageFieldsContainer');
        const rawMessage = document.getElementById('rawMessage');
        const sendValue = document.getElementById('sendValue');
        const methodId = document.getElementById('methodId');
        const compileDeployBtn = document.getElementById('compileDeployBtn');
        const sendMessageBtn = document.getElementById('sendMessageBtn');
        const callGetMethodBtn = document.getElementById('callGetMethodBtn');

        operationHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const operation = header.dataset.operation;
                toggleOperation(operation);
            });
        });

        sendContractSelect.addEventListener('change', () => {
            updateMessagesList();
            updateFormData();
        });
        getContractSelect.addEventListener('change', () => {
            updateGetMethodsList();
            updateFormData();
        });
        methodSelect.addEventListener('change', () => {
            updateMethodId();
            updateFormData();
        });
        messageSelect.addEventListener('change', () => {
            updateMessageFields();
            updateFormData();
        });
        rawMessage.addEventListener('input', updateFormData);
        sendValue.addEventListener('input', updateFormData);
        methodId.addEventListener('input', updateFormData);

        compileDeployBtn.addEventListener('click', () => {
            const storageInputs = storageFieldsContainer.querySelectorAll('input');
            const emptyRequiredFields = [];

            storageInputs.forEach(input => {
                if (!input.value.trim()) {
                    emptyRequiredFields.push(input.dataset.fieldName);
                }
            });

            if (emptyRequiredFields.length > 0) {
                showResult('compile-deploy-result', {
                    success: false,
                    message: \`Please fill in all storage fields: \${emptyRequiredFields.join(', ')}\`
                });
                return;
            }

            vscode.postMessage({type: 'compileAndDeploy'});
        });

        sendMessageBtn.addEventListener('click', () => {
            if (!formData.sendContract) {
                showResult('send-message-result', {success: false, message: 'Please select a contract first'});
                return;
            }

            if (!formData.selectedMessage && !formData.rawMessage) {
                showResult('send-message-result', {success: false, message: 'Please select a message or enter raw message'});
                return;
            }

            vscode.postMessage({type: 'sendMessage', formData});
        });

        callGetMethodBtn.addEventListener('click', () => {
            if (!formData.getContract) {
                showResult('get-method-result', {success: false, message: 'Please select a contract first'});
                return;
            }
            vscode.postMessage({type: 'callGetMethod', formData});
        });

        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'updateContracts':
                    updateContracts(message.contracts);
                    break;
                case 'showResult':
                    showResult(message.resultId || 'send-message-result', message.result);
                    break;
                case 'openOperation':
                    openOperation(message.operation, message.contractAddress);
                    break;
                case 'updateStorageFields':
                    updateStorageFields(message.abi);
                    break;
            }
        });

        function toggleOperation(operation) {
            const content = document.getElementById(\`\${operation}-content\`);
            const header = document.querySelector(\`[data-operation="\${operation}"]\`);
            const chevron = header.querySelector('.chevron');

            operationHeaders.forEach(h => {
                if (h !== header) {
                    h.classList.remove('active');
                    const c = document.getElementById(\`\${h.dataset.operation}-content\`);
                    c.classList.remove('expanded');
                    h.querySelector('.chevron').classList.remove('expanded');
                }
            });

            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                header.classList.remove('active');
                chevron.classList.remove('expanded');
                activeOperation = null;
            } else {
                content.classList.add('expanded');
                header.classList.add('active');
                chevron.classList.add('expanded');
                activeOperation = operation;

                if (operation === 'compile-deploy') {
                    vscode.postMessage({type: 'loadAbiForDeploy'});
                }
            }
        }

        function openOperation(operation, contractAddress) {
            if (activeOperation !== operation) {
                toggleOperation(operation);
            }

            if (operation === 'compile-deploy') {
                vscode.postMessage({type: 'loadAbiForDeploy'});
            }

            if (contractAddress) {
                if (operation === 'send-message') {
                    sendContractSelect.value = contractAddress;
                    updateMessagesList();
                } else if (operation === 'get-method') {
                    getContractSelect.value = contractAddress;
                    updateGetMethodsList();
                }
            } else if (deployedContracts.length > 0) {
                if (operation === 'send-message' && !sendContractSelect.value) {
                    sendContractSelect.value = deployedContracts[0].address;
                    updateMessagesList();
                } else if (operation === 'get-method' && !getContractSelect.value) {
                    getContractSelect.value = deployedContracts[0].address;
                    updateGetMethodsList();
                }
            }
            updateFormData();
        }

        function updateFormData() {
            const messageFields = {};
            const messageFieldInputs = messageFieldsContainer.querySelectorAll('input');
            messageFieldInputs.forEach(input => {
                if (input.value) {
                    messageFields[input.dataset.fieldName] = input.value;
                }
            });

            const storageFields = {};
            const storageFieldInputs = storageFieldsContainer.querySelectorAll('input');
            storageFieldInputs.forEach(input => {
                if (input.value) {
                    storageFields[input.dataset.fieldName] = input.value;
                }
            });

            formData = {
                sendContract: sendContractSelect.value || undefined,
                getContract: getContractSelect.value || undefined,
                rawMessage: rawMessage.value || undefined,
                selectedMessage: messageSelect.value || undefined,
                messageFields: Object.keys(messageFields).length > 0 ? messageFields : undefined,
                value: sendValue.value || undefined,
                methodId: methodId.value || undefined,
                selectedMethod: methodSelect.value || undefined,
                storageFields: Object.keys(storageFields).length > 0 ? storageFields : undefined
            };

            vscode.postMessage({
                type: 'formDataChanged',
                formData: formData
            });
        }

        function updateGetMethodsList() {
            const selectedContractAddress = getContractSelect.value;
            const selectedContract = deployedContracts.find(c => c.address === selectedContractAddress);

            methodSelect.innerHTML = '<option value="">Select method...</option>';
            methodId.value = '0';

            if (selectedContract && selectedContract.abi && selectedContract.abi.getMethods) {
                selectedContract.abi.getMethods.forEach(method => {
                    const option = document.createElement('option');
                    option.value = method.name;
                    option.textContent = \`\${method.name} (ID: 0x\${method.id.toString(16)})\`;
                    option.dataset.methodId = method.id.toString();
                    methodSelect.appendChild(option);
                });

                methodSelect.disabled = false;

                if (selectedContract.abi.getMethods.length > 0 && !methodSelect.value) {
                    methodSelect.value = selectedContract.abi.getMethods[0].name;
                    updateMethodId();
                }
            } else {
                methodSelect.disabled = true;
                methodId.readOnly = false;
            }
        }

        function updateMethodId() {
            const selectedOption = methodSelect.selectedOptions[0];
            if (selectedOption && selectedOption.dataset.methodId) {
                methodId.value = selectedOption.dataset.methodId;
                methodId.readOnly = true;
            } else {
                methodId.value = '0';
                methodId.readOnly = false;
            }
        }

        function updateMessagesList() {
            const selectedContractAddress = sendContractSelect.value;
            const selectedContract = deployedContracts.find(c => c.address === selectedContractAddress);

            messageSelect.innerHTML = '<option value="">Select message...</option>';
            messageFieldsContainer.innerHTML = '';

            if (selectedContract && selectedContract.abi && selectedContract.abi.messages) {
                selectedContract.abi.messages.forEach(message => {
                    const option = document.createElement('option');
                    option.value = message.name;
                    option.textContent = \`\${message.name} (opcode: 0x\${message.opcode.toString(16)})\`;
                    messageSelect.appendChild(option);
                });

                messageSelect.disabled = false;

                if (selectedContract.abi.messages.length > 0 && !messageSelect.value) {
                    messageSelect.value = selectedContract.abi.messages[0].name;
                    updateMessageFields();
                }
            } else {
                messageSelect.disabled = true;
                messageFieldsContainer.innerHTML = '<div class="no-messages">No messages available for this contract</div>';
            }
        }

        function updateMessageFields() {
            const selectedContractAddress = sendContractSelect.value;
            const selectedContract = deployedContracts.find(c => c.address === selectedContractAddress);
            const selectedMessageName = messageSelect.value;

            messageFieldsContainer.innerHTML = '';

            if (selectedContract && selectedContract.abi && selectedMessageName) {
                const selectedMessage = selectedContract.abi.messages.find(m => m.name === selectedMessageName);

                if (selectedMessage && selectedMessage.fields && selectedMessage.fields.length > 0) {
                    selectedMessage.fields.forEach(field => {
                        const fieldDiv = document.createElement('div');
                        fieldDiv.className = 'message-field';

                        fieldDiv.innerHTML = \`
                            <div class="message-field-header">
                                <span class="message-field-name">\${field.name}</span>
                                <span class="message-field-type">\${field.type}</span>
                            </div>
                            <input type="text"
                                   data-field-name="\${field.name}"
                                   data-field-type="\${field.type}"
                                   placeholder="Enter \${field.name} (\${field.type})"
                                   class="message-field-input">
                        \`;

                        messageFieldsContainer.appendChild(fieldDiv);

                        const input = fieldDiv.querySelector('input');
                        input.addEventListener('input', updateFormData);
                    });
                } else {
                    messageFieldsContainer.innerHTML = '<div class="no-messages">This message has no fields</div>';
                }
            }
        }

        function updateStorageFields(abi) {
            storageFieldsContainer.innerHTML = '';

            if (abi && abi.storage && abi.storage.fields && abi.storage.fields.length > 0) {
                const storageTitle = document.createElement('div');
                storageTitle.className = 'form-group';
                storageTitle.innerHTML = '<label>Storage Fields:</label>';
                storageFieldsContainer.appendChild(storageTitle);

                abi.storage.fields.forEach(field => {
                    const fieldDiv = document.createElement('div');
                    fieldDiv.className = 'message-field';

                    fieldDiv.innerHTML = \`
                        <div class="message-field-header">
                            <span class="message-field-name">\${field.name}</span>
                            <span class="message-field-type">\${field.type}</span>
                        </div>
                        <input type="text"
                               data-field-name="\${field.name}"
                               data-field-type="\${field.type}"
                               placeholder="Enter \${field.name} (\${field.type})"
                               class="message-field-input">
                    \`;

                    storageFieldsContainer.appendChild(fieldDiv);

                    const input = fieldDiv.querySelector('input');
                    input.addEventListener('input', updateFormData);
                });
            }
        }

        function updateContracts(contracts) {
            deployedContracts = contracts;

            if (contracts.length === 0) {
                noContractsMessage.style.display = 'block';
                sendMessageBtn.disabled = true;
                callGetMethodBtn.disabled = true;
            } else {
                noContractsMessage.style.display = 'none';
                sendMessageBtn.disabled = false;
                callGetMethodBtn.disabled = false;
            }

            updateContractSelect(sendContractSelect, contracts);
            updateContractSelect(getContractSelect, contracts);

            if (contracts.length > 0) {
                if (!sendContractSelect.value) {
                    sendContractSelect.value = contracts[0].address;
                    updateMessagesList();
                }
                if (!getContractSelect.value) {
                    getContractSelect.value = contracts[0].address;
                    updateGetMethodsList();
                }
            }

            updateFormData();
        }

        function updateContractSelect(selectElement, contracts) {
            const currentValue = selectElement.value;
            selectElement.innerHTML = '<option value="">Select contract...</option>';

            contracts.forEach(contract => {
                const option = document.createElement('option');
                option.value = contract.address;
                option.textContent = \`\${contract.name} (\${formatAddress(contract.address)})\`;
                selectElement.appendChild(option);
            });

            if (currentValue && contracts.some(c => c.address === currentValue)) {
                selectElement.value = currentValue;
            }
        }

        function showResult(resultId, resultData) {
            const resultElement = document.getElementById(resultId);
            if (!resultElement) return;

            resultElement.textContent = resultData.message;
            if (resultData.details) {
                resultElement.textContent += '\\n\\n' + resultData.details;
            }

            resultElement.className = \`result \${resultData.success ? 'success' : 'error'}\`;
            resultElement.style.display = 'block';

            setTimeout(() => {
                resultElement.style.display = 'none';
            }, 10000);
        }

        function formatAddress(address) {
            if (address.length <= 12) return address;
            return \`\${address.substring(0, 6)}...\${address.substring(address.length - 6)}\`;
        }

        updateFormData();
    </script>
</body>
</html>`
    }
}
