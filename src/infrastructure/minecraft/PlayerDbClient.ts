import axios from 'axios';
export class PlayerDbClient {
    async exists(gamertag: string): Promise<boolean> {
        const url = `https://playerdb.co/api/player/xbox/${encodeURIComponent(gamertag)}`;
        const resp = await axios.get(url, { validateStatus: () => true });
        return resp.data?.success === true;
    }
    async healthCheck(): Promise<boolean> {
        const resp = await axios.get('https://playerdb.co/api/player/xbox/Notch', { timeout: 3000 });
        return !!(resp.data && resp.data.success);
    }
}
