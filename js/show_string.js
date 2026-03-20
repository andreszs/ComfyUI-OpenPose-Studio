import { app } from "/scripts/app.js";
import { ComfyWidgets } from "/scripts/widgets.js";

app.registerExtension({
    name: "OpenPoseStudio.ShowString",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "OPS_ShowString") return;

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);

            // Remove any previously created display widgets
            const pos = this.widgets?.findIndex((w) => w.name === "text") ?? -1;
            if (pos !== -1) {
                for (let i = pos; i < this.widgets.length; i++) {
                    this.widgets[i].onRemove?.();
                }
                this.widgets.length = pos;
            }

            // Add a readonly multiline widget for each text value
            for (const text of message.text) {
                const w = ComfyWidgets["STRING"](
                    this,
                    "text",
                    ["STRING", { multiline: true }],
                    app
                ).widget;
                w.inputEl.readOnly = true;
                w.inputEl.style.opacity = 0.6;
                w.value = text;
            }

            this.setDirtyCanvas?.(true, true);
        };
    },
});
