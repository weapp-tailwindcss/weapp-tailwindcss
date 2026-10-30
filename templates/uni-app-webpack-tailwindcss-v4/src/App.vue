<script lang="ts">
import Vue from 'vue';
export default Vue.extend({
    mpType: 'app',
    onLaunch() {
        console.log('App Launch')
    },
    onShow() {
        console.log('App Show')
    },
    onHide() {
        console.log('App Hide')
    }
});
</script>

<style>
/* #ifdef APP-PLUS */
@import './main.css';
/* #endif */
</style>
