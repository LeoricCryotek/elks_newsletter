/** @odoo-module **/
import { Component, onMounted, onWillStart, onWillUnmount, useRef } from '@odoo/owl';
import { registry } from '@web/core/registry';
import { useService } from '@web/core/utils/hooks';
import { useSetupAction } from '@web/search/action_hook';

export class ElksPaperStudio extends Component {
    static template = 'elks_newsletter.PaperStudio';
    static props = ['*'];
    setup() {
        this.orm = useService('orm');
        this.actionService = useService('action');
        this.notification = useService('notification');
        this.frame = useRef('frame');
        this.issueId = this.props.action.params.issue_id;
        this.busy = false;
        this.dirty = false;
        useSetupAction({
            beforeLeave: () => !this.dirty || window.confirm('Leave without saving your paper changes?'),
            beforeUnload: event => {
                if (this.dirty) { event.preventDefault(); event.returnValue = ''; }
            },
        });
        onWillStart(async () => {
            this.payload = await this.orm.call('elks.newsletter.issue', 'action_studio_load', [[this.issueId]]);
        });
        this.onMessage = this.onMessage.bind(this);
        onMounted(() => window.addEventListener('message', this.onMessage));
        onWillUnmount(() => window.removeEventListener('message', this.onMessage));
    }
    send(message) {
        this.frame.el?.contentWindow.postMessage({ channel: 'elks-paper', ...message }, window.location.origin);
    }
    onFrameLoad() {
        this.send({ type: 'load', payload: this.payload });
    }
    async onMessage(event) {
        if (event.origin !== window.location.origin || event.source !== this.frame.el?.contentWindow
            || event.data?.channel !== 'elks-paper') return;
        const { type, requestId } = event.data;
        if (type === 'ready') return this.onFrameLoad();
        if (type === 'dirty') { this.dirty = Boolean(event.data.dirty); return; }
        if (type === 'manage-members') {
            try {
                const action = await this.orm.call('elks.newsletter.issue','action_studio_manage_members',[[this.issueId],event.data.source,event.data.month || '']);
                await this.actionService.doAction(action,{onClose:()=>this.send({type:'refresh-data'})});
            } catch (error) { this.send({type:'resolve-error',requestId,message:error.data?.message || error.message}); this.notification.add(error.data?.message || error.message,{type:'danger'}); }
            return;
        }
        if (type === 'resolve') {
            try {
                const blocks = await this.orm.call('elks.newsletter.issue', 'action_studio_resolve', [[this.issueId], event.data.document]);
                this.send({ type: 'resolved', requestId, blocks });
            } catch (error) {
                this.send({ type: 'resolve-error', requestId, message: error.data?.message || error.message });
            }
            return;
        }
        if (!['save', 'preview', 'back', 'reload'].includes(type) || this.busy) return;
        this.busy = true;
        let saved = false;
        try {
            if (type === 'reload') {
                this.payload = await this.orm.call('elks.newsletter.issue', 'action_studio_load', [[this.issueId]]);
                this.dirty = false;
                this.send({ type: 'saved', requestId, payload: this.payload });
                return;
            }
            if (type === 'back') {
                this.dirty = false; // The iframe already confirmed abandoning edits.
                await this.actionService.doAction({ type: 'ir.actions.act_window', res_model: 'elks.newsletter.issue', res_id: this.issueId, views: [[false, 'form']], target: 'current' });
                return;
            }
            if (!this.payload.readonly) {
                this.payload = await this.orm.call('elks.newsletter.issue', 'action_studio_save',
                    [[this.issueId], event.data.document, event.data.paperSize, event.data.revision]);
                saved = true;
            }
            if (type === 'preview') {
                const action = await this.orm.call('elks.newsletter.issue', 'action_preview_pdf', [[this.issueId]]);
                this.dirty = false;
                this.send({ type: 'saved', requestId, payload: this.payload });
                await this.actionService.doAction(action);
            } else {
                this.dirty = false;
                this.send({ type: 'saved', requestId, payload: this.payload });
            }
        } catch (error) {
            // Saving may have succeeded before PDF validation found overflow.
            // Return its canonical snapshot/revision so the editor can fix it.
            if (saved) {
                this.dirty = false;
                this.send({ type: 'saved', requestId, payload: this.payload });
            }
            const message = error.data?.message || error.message || 'The paper edition could not be saved.';
            this.send({ type: 'error', requestId, message });
            this.notification.add(message, { type: 'danger' });
        } finally {
            this.busy = false;
        }
    }
}
registry.category('actions').add('elks_newsletter.paper_studio', ElksPaperStudio);
