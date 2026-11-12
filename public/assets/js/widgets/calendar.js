import { renderCalendarWidget } from '../events/event-view.js';
import { registerWidget } from './registry.js';

registerWidget('calendar', (container, widget) => renderCalendarWidget(container, widget));
