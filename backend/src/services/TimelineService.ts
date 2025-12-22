import fs from 'fs';
import path from 'path';

export class TimelineService {
    private filePath: string;

    constructor() {
        // Store in backend/data/timeline.json
        this.filePath = path.join(process.cwd(), 'data', 'timeline.json');

        // Ensure directory exists
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    saveTimeline(data: any): boolean {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
            console.log('✅ Timeline saved to', this.filePath);
            return true;
        } catch (error) {
            console.error('❌ Error saving timeline:', error);
            return false;
        }
    }

    loadTimeline(): any | null {
        try {
            if (!fs.existsSync(this.filePath)) {
                return null;
            }
            const content = fs.readFileSync(this.filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error('❌ Error loading timeline:', error);
            return null;
        }
    }
}
